import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Avatar } from '../../components/ui';
import LiveVideoLayer from '../../components/LiveVideoLayer';
import {
  configureAgoraVoice,
  enterPublisherAudioRoute,
  requestBluetoothConnect,
  requestMicPermission,
  syncAgoraAudioRoute,
} from '../../lib/liveVoice';
import { confirmMatchJoined, hangupMatch } from '../../lib/matchCall';

let Agora = null;
try {
  Agora = require('react-native-agora');
} catch (_e) {
  Agora = null;
}

async function requestMedia(audioOnly) {
  if (Platform.OS !== 'android') return true;
  await requestBluetoothConnect();
  const mic = await requestMicPermission();
  if (!mic) return false;
  if (!audioOnly) {
    const cam = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    if (cam !== PermissionsAndroid.RESULTS.GRANTED && cam !== PermissionsAndroid.RESULTS.LIMITED) return false;
  }
  return true;
}

function statusLabel(state, remoteUid, audioOnly) {
  if (state === 'searching') return 'Searching for a match…';
  if (state === 'matched' || state === 'connecting') return 'Connecting…';
  if (state === 'connected' && remoteUid) return audioOnly ? 'Connected · voice' : 'Connected';
  if (state === 'connected') return 'Waiting for video…';
  if (state === 'ending') return 'Ending call…';
  if (state === 'failed') return 'Call failed';
  return 'Connecting…';
}

export default function CallScreen({ route, navigation }) {
  const params = route.params || {};
  const {
    matchId,
    channel,
    peerId,
    peerName,
    peerPic,
    audioOnly = false,
    cost = 0,
    balance: initialBalance = 0,
    status: initialStatus = 'matched',
  } = params;

  const insets = useSafeAreaInsets();
  const { api } = useAuth();
  const socket = useSocket();

  const [phase, setPhase] = useState(initialStatus);
  const [remoteUid, setRemoteUid] = useState(null);
  const [agoraReady, setAgoraReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(Boolean(audioOnly));
  const [mirrored, setMirrored] = useState(true);
  const [balance, setBalance] = useState(Number(initialBalance || 0));
  const [minutes, setMinutes] = useState(0);

  const engineRef = useRef(null);
  const endedRef = useRef(false);
  const joinedServerRef = useRef(false);
  const remoteUidRef = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const finish = useCallback(
  async (reason = 'ended') => {
    if (endedRef.current) return;
    endedRef.current = true;
    setPhase('ending');
    try {
      await hangupMatch(api, matchId);
    } catch (_e) {}
    try {
      socket.matchHangup?.(matchId).catch(() => {});
    } catch (_e) {}
    try {
      engineRef.current?.leaveChannel?.();
      engineRef.current?.release?.();
    } catch (_e) {}
    engineRef.current = null;
    if (navigation.canGoBack()) navigation.goBack();
  },
  [api, matchId, navigation, socket]
);

  useEffect(() => {
    let cancelled = false;
    const unsubs = [];

    (async () => {
      try {
        const mediaOk = await requestMedia(audioOnly);
        if (!mediaOk) {
          Alert.alert('Permission needed', audioOnly ? 'Allow microphone to use voice match.' : 'Allow camera and microphone to use video match.');
          finish('failed');
          return;
        }
        await socket.connect?.();
        await enterPublisherAudioRoute('match_call');

        unsubs.push(
          socket.on('match:connected', (p) => {
            if (p?.matchId && String(p.matchId) !== String(matchId)) return;
            if (!cancelled) setPhase('connected');
          })
        );
        unsubs.push(
          socket.on('match:ended', (p) => {
            if (p?.matchId && String(p.matchId) !== String(matchId)) return;
            finish(p?.reason || 'ended');
          })
        );
        unsubs.push(
          socket.on('match:charge', (p) => {
            if (p?.matchId && String(p.matchId) !== String(matchId)) return;
            if (!cancelled) {
              setBalance(Number(p.balance || 0));
              setMinutes(Number(p.minute || 0));
            }
          })
        );
        unsubs.push(
          socket.on('match:insufficient', (p) => {
            if (p?.matchId && String(p.matchId) !== String(matchId)) return;
            Alert.alert('Not enough coins', p?.message || 'Recharge to continue matching.', [
              { text: 'Recharge', onPress: () => navigation.navigate('Recharge') },
              { text: 'OK', onPress: () => finish('insufficient') },
            ]);
          })
        );

        if (!Agora || !channel) {
          setAgoraReady(true);
          setJoined(true);
          return;
        }

        const tokenRes = await api.post('/live/agora/token', { channel, role: 'host' });
        const appId = tokenRes.appId || tokenRes.data?.appId;
        const token = tokenRes.token || tokenRes.data?.token || null;
        const uid = Number(tokenRes.uid || tokenRes.data?.uid || 0);
        if (!appId) throw new Error('Could not start call video');

        const { createAgoraRtcEngine, ChannelProfileType, ClientRoleType } = Agora;
        const engine = createAgoraRtcEngine();
        engineRef.current = engine;
        engine.initialize({ appId });
        configureAgoraVoice(engine, { publishing: true, party: false });

        engine.registerEventHandler({
          onJoinChannelSuccess: async () => {
            if (cancelled) return;
            setJoined(true);
            setAgoraReady(true);
            await syncAgoraAudioRoute(engine, { speakerWanted: true });
            if (!joinedServerRef.current) {
              joinedServerRef.current = true;
              try {
                await confirmMatchJoined(api, matchId);
                await socket.matchJoined?.(matchId);
              } catch (e) {
                if (e?.body?.code === 'INSUFFICIENT_BALANCE' || /insufficient/i.test(e.message || '')) {
                  Alert.alert('Not enough coins', 'Recharge to start this match.', [
                    { text: 'Recharge', onPress: () => navigation.navigate('Recharge') },
                    { text: 'OK', onPress: () => finish('insufficient') },
                  ]);
                  return;
                }
              }
            }
          },
          onUserJoined: (_conn, remote) => {
            if (cancelled) return;
            remoteUidRef.current = remote;
            setRemoteUid(remote);
            setPhase('connected');
          },
          onUserOffline: (_conn, remote) => {
            if (cancelled) return;
            if (remoteUidRef.current === remote) {
              remoteUidRef.current = null;
              setRemoteUid(null);
            }
          },
          onError: () => {
            if (!cancelled) setPhase('failed');
          },
        });

        if (audioOnly) {
          engine.enableAudio?.();
          engine.disableVideo?.();
        } else {
          engine.enableVideo?.();
          engine.enableLocalVideo?.(true);
          engine.startPreview?.();
        }

        await engine.joinChannel(token, channel, uid, {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
          publishMicrophoneTrack: true,
          publishCameraTrack: !audioOnly && !camOff,
          autoSubscribeAudio: true,
          autoSubscribeVideo: !audioOnly,
        });
      } catch (e) {
        if (!cancelled) {
          Alert.alert('Call failed', e.message || 'Try again');
          finish('failed');
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => {
        try {
          u?.();
        } catch (_e) {}
      });
      if (!endedRef.current) {
        hangupMatch(api, matchId).catch(() => {});
      }
      try {
        engineRef.current?.leaveChannel?.();
        engineRef.current?.release?.();
      } catch (_e) {}
      engineRef.current = null;
    };
  }, [api, audioOnly, channel, finish, matchId, navigation, socket]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    try {
      engineRef.current?.muteLocalAudioStream?.(next);
    } catch (_e) {}
  }, [muted]);

  const toggleCam = useCallback(() => {
    if (audioOnly) return;
    const next = !camOff;
    setCamOff(next);
    const eng = engineRef.current;
    try {
      if (!next) {
        eng?.enableLocalVideo?.(true);
        eng?.startPreview?.();
        eng?.muteLocalVideoStream?.(false);
        eng?.updateChannelMediaOptions?.({ publishCameraTrack: true, autoSubscribeVideo: true });
      } else {
        eng?.muteLocalVideoStream?.(true);
        eng?.updateChannelMediaOptions?.({ publishCameraTrack: false });
      }
    } catch (_e) {}
  }, [audioOnly, camOff]);

  const flipCam = useCallback(() => {
    try {
      engineRef.current?.switchCamera?.();
      setMirrored((m) => !m);
    } catch (_e) {}
  }, []);

  const subtitle = useMemo(
    () => statusLabel(phase, remoteUid, audioOnly),
    [audioOnly, phase, remoteUid]
  );

  const showRemoteVideo = !audioOnly && remoteUid && agoraReady;
  const showLocalPip = !audioOnly && !camOff && agoraReady;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      {showRemoteVideo ? (
        <LiveVideoLayer
          key="match-remote"
          agoraReady={agoraReady}
          isHost={false}
          remoteUid={remoteUid}
          camOff={false}
          hostProfilePic={peerPic}
          hostName={peerName || 'Match'}
        />
      ) : (
        <View style={styles.stage}>
          <Avatar uri={peerPic} name={peerName || 'Match'} size={96} />
          <Text style={styles.name}>{peerName || 'Match'}</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>
      )}

      {showLocalPip ? (
        <View style={[styles.pip, { top: insets.top + 12 }]}>
          <LiveVideoLayer
            key="match-local"
            agoraReady={agoraReady}
            isHost
            remoteUid={null}
            camOff={camOff}
            mirrored={mirrored}
            hostProfilePic={peerPic}
            hostName="You"
            style={{ width: 110, height: 150 }}
          />
        </View>
      ) : null}

      <View style={[styles.meta, { top: insets.top + 8 }]}>
        <Text style={styles.metaT}>
          {audioOnly ? 'Voice Match' : 'Video Match'} · {cost || '—'} coins/min
        </Text>
        <Text style={styles.metaB}>
          Balance {balance} {minutes > 0 ? `· ${minutes} min` : ''}
        </Text>
      </View>

      <View style={[styles.bar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={toggleMute} style={styles.round}>
          <Ionicons name={muted ? 'mic-off' : 'mic'} size={22} color="#fff" />
        </Pressable>
        {!audioOnly ? (
          <>
            <Pressable onPress={toggleCam} style={styles.round}>
              <Ionicons name={camOff ? 'videocam-off' : 'videocam'} size={22} color="#fff" />
            </Pressable>
            <Pressable onPress={flipCam} style={styles.round}>
              <Ionicons name="camera-reverse" size={22} color="#fff" />
            </Pressable>
          </>
        ) : null}
        <Pressable onPress={() => finish('ended')} style={[styles.round, styles.end]}>
          <Ionicons name="call" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontWeight: '800', fontSize: 22, marginTop: 14 },
  sub: { color: 'rgba(255,255,255,0.7)', marginTop: 8 },
  meta: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  metaT: { color: '#fde68a', fontWeight: '800', fontSize: 12 },
  metaB: { color: 'rgba(255,255,255,0.75)', marginTop: 4, fontSize: 12 },
  pip: { position: 'absolute', right: 12, width: 110, height: 150, borderRadius: 12, overflow: 'hidden' },
  bar: { flexDirection: 'row', justifyContent: 'center', gap: 14 },
  round: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  end: { backgroundColor: '#EF4444', transform: [{ rotate: '135deg' }] },
});
