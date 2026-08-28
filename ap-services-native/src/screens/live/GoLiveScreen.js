import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../../components/ui';
import { cancelMatch } from '../../lib/matchCall';
import { mediaUrl } from '../../config/api';
import { BEAUTY_FILTERS, applyAgoraBeauty, beautyTint } from '../../lib/liveBeauty';

const FILTER_KEY = 'ap_live_beauty_filter';

let Agora = null;
try {
  Agora = require('react-native-agora');
} catch (_e) {
  Agora = null;
}

/**
 * Webview / design parity: full camera, top edit capsule, Beauty + Go + Mic, Live|Party.
 * Filters only appear when Beauty is opened — applied live on camera.
 */
export default function GoLiveScreen({ navigation, route }) {
  const initialParty = Boolean(route.params?.isParty);
  const insets = useSafeAreaInsets();
  const { api, user, displayName } = useAuth();
  const [isParty, setIsParty] = useState(initialParty);
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState(null);
  const [filter, setFilter] = useState('none');
  const [showBeauty, setShowBeauty] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const started = useRef(false);
  const engineRef = useRef(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  useEffect(() => {
    AsyncStorage.getItem(FILTER_KEY)
      .then((v) => {
        if (v && BEAUTY_FILTERS.some((f) => f.id === v)) setFilter(v);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Agora) {
        setPreviewReady(false);
        return;
      }
      try {
        if (Platform.OS === 'android') {
          const cam = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          if (cam !== PermissionsAndroid.RESULTS.GRANTED) {
            setError('Allow camera to preview before going live');
            setPreviewReady(false);
            return;
          }
        }
        const tokenRes = await api
          .post('/live/agora/token', {
            channel: `preview${String(user?.id || 'x').replace(/-/g, '').slice(0, 10)}`,
            role: 'host',
          })
          .catch(() => null);
        const appId = tokenRes?.appId || tokenRes?.data?.appId;
        if (!appId || cancelled) return;
        try {
          engineRef.current?.stopPreview?.();
          engineRef.current?.release?.();
        } catch (_e) {}
        const { createAgoraRtcEngine } = Agora;
        const engine = createAgoraRtcEngine();
        engineRef.current = engine;
        engine.initialize({ appId });
        engine.enableVideo?.();
        engine.enableLocalVideo?.(true);
        engine.enableLocalAudio?.(true);
        engine.muteLocalAudioStream?.(!micOn);
        engine.startPreview?.();
        applyAgoraBeauty(engine, filterRef.current);
        if (!cancelled) {
          setError('');
          setPreviewReady(true);
        }
      } catch (_e) {
        if (!cancelled) {
          setPreviewReady(false);
          setError('Could not open camera');
        }
      }
    })();
    return () => {
      cancelled = true;
      try {
        engineRef.current?.stopPreview?.();
        engineRef.current?.release?.();
      } catch (_e) {}
      engineRef.current = null;
      setPreviewReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user?.id]);

  useEffect(() => {
    if (engineRef.current) applyAgoraBeauty(engineRef.current, filter);
  }, [filter]);

  useEffect(() => {
    try {
      engineRef.current?.muteLocalAudioStream?.(!micOn);
    } catch (_e) {}
  }, [micOn]);

  const chooseFilter = (id) => {
    setFilter(id);
    AsyncStorage.setItem(FILTER_KEY, id).catch(() => {});
    if (engineRef.current) applyAgoraBeauty(engineRef.current, id);
  };

  const pickCover = async () => {
    const asset = await pickMedia('image');
    if (asset?.uri) setCover(asset.uri);
  };

  const start = async () => {
    if (started.current || busy) return;
    setError('');
    setBusy(true);
    started.current = true;
    try {
      if (Platform.OS === 'android') {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        if (results[PermissionsAndroid.PERMISSIONS.CAMERA] !== PermissionsAndroid.RESULTS.GRANTED) {
          started.current = false;
          setBusy(false);
          setError('Camera permission is required');
          Alert.alert('Camera needed', 'Allow camera access to start live.');
          return;
        }
      }
      try {
        engineRef.current?.stopPreview?.();
        engineRef.current?.release?.();
      } catch (_e) {}
      engineRef.current = null;

      await cancelMatch(api).catch(() => {});

      const channel = `ap${String(user?.id || '').replace(/-/g, '').slice(0, 12)}${Date.now().toString(36)}`.slice(0, 32);
      try {
        await api.post('/host/start', {
          channel,
          title: title.trim() || undefined,
          coverUrl: cover,
          roomType: isParty ? 'party' : 'live',
          audioOnly: false,
          beautyFilter: filter,
        });
      } catch (e) {
        console.warn('host/start', e?.message || e);
      }
      navigation.replace(isParty ? 'PartyRoom' : 'LiveRoom', {
        channel,
        hostName: title.trim() || displayName || user?.first_name || 'My live',
        hostId: user?.id,
        hostProfilePic: user?.profile_pic,
        hostStreamCover: cover,
        isHost: true,
        isParty,
        viewers: 0,
        title: title.trim(),
        beautyFilter: filter,
        startMuted: !micOn,
      });
    } catch (e) {
      started.current = false;
      setError(e.message || 'Could not start');
      Alert.alert('Could not start', e.message || 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const RtcView = (Platform.OS === 'android' && Agora?.RtcTextureView) || Agora?.RtcSurfaceView;
  const VideoSourceType = Agora?.VideoSourceType;
  const tint = beautyTint(filter);
  const showCam = previewReady && RtcView;
  const label = title.trim() || displayName || 'Your live';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {showCam ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <RtcView
            style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }]}
            canvas={{ uid: 0, sourceType: VideoSourceType?.VideoSourceCamera }}
          />
          {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
        </View>
      ) : (
        <LinearGradient
          colors={isParty ? ['#2E1065', '#1E1B4B', '#0F0A1A'] : ['#1C1917', '#292524', '#0C0A09']}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.55)']}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.xBtn} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Pressable onPress={() => setShowEdit(true)} style={styles.capsule}>
          <Avatar uri={mediaUrl(cover || user?.profile_pic)} name={displayName} size={34} />
          <Text style={styles.capsuleT} numberOfLines={1}>{label}</Text>
          <View style={styles.editPill}>
            <Ionicons name="pencil" size={12} color="#fff" />
            <Text style={styles.editPillT}>Edit</Text>
          </View>
        </Pressable>
        <View style={{ width: 40 }} />
      </View>

      {isParty && !showCam ? (
        <View style={styles.partyHint}>
          <Avatar uri={mediaUrl(cover || user?.profile_pic)} name={displayName} size={88} />
          <Text style={styles.partyHintT}>Party · video + voice on seats</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.err}>{error}</Text> : null}

      {/* Beauty filters — only when Beauty is open (webview flow) */}
      {showBeauty && !isParty ? (
        <View style={[styles.beautyDock, { bottom: 118 + insets.bottom }]}>
          <Text style={styles.beautyTitle}>Beauty · see on camera</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
            {BEAUTY_FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <Pressable key={f.id} onPress={() => chooseFilter(f.id)} style={styles.filterChip}>
                  <LinearGradient colors={f.swatch} style={[styles.swatch, on && styles.swatchOn]} />
                  <Text style={[styles.filterLabel, on && styles.filterLabelOn]} numberOfLines={1}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.dock}>
          {!isParty ? (
            <Pressable
              onPress={() => setShowBeauty((v) => !v)}
              style={[styles.sideBtn, showBeauty && styles.sideBtnOn]}
            >
              <Ionicons name="color-wand" size={22} color="#fff" />
              <Text style={styles.sideBtnT}>Beauty</Text>
            </Pressable>
          ) : (
            <View style={styles.sideBtn} />
          )}

          <Pressable onPress={start} disabled={busy} style={[styles.goWrap, busy && { opacity: 0.6 }]}>
            <View style={styles.goBtn}>
              <Text style={styles.goT}>{busy ? '…' : 'Go'}</Text>
            </View>
          </Pressable>

          <Pressable onPress={() => setMicOn((v) => !v)} style={styles.sideBtn}>
            <Ionicons name={micOn ? 'mic' : 'mic-off'} size={22} color="#fff" />
            <Text style={styles.sideBtnT}>{micOn ? 'Mic ON' : 'Mic OFF'}</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          <Pressable onPress={() => { setIsParty(false); setShowBeauty(false); }} style={styles.tab}>
            <Text style={[styles.tabT, !isParty && styles.tabTOn]}>Live</Text>
            {!isParty ? <View style={styles.tabBar} /> : null}
          </Pressable>
          <Pressable onPress={() => { setIsParty(true); setShowBeauty(false); }} style={styles.tab}>
            <Text style={[styles.tabT, isParty && styles.tabTOn]}>Party</Text>
            {isParty ? <View style={styles.tabBar} /> : null}
          </Pressable>
        </View>
      </View>

      {showEdit ? (
        <Pressable style={styles.editOverlay} onPress={() => setShowEdit(false)}>
          <Pressable style={[styles.editSheet, { paddingBottom: 16 + insets.bottom }]} onPress={() => {}}>
            <Text style={styles.editH}>Live presentation</Text>
            <Pressable onPress={pickCover} style={styles.coverRow}>
              <Avatar uri={mediaUrl(cover || user?.profile_pic)} name={displayName} size={48} />
              <Text style={styles.coverT}>{cover ? 'Change cover' : 'Add cover photo'}</Text>
            </Pressable>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Live title"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
            <Pressable onPress={() => setShowEdit(false)} style={styles.doneBtn}>
              <Text style={styles.doneT}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    zIndex: 5,
  },
  xBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  capsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 8,
  },
  capsuleT: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 13 },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  editPillT: { color: '#fff', fontWeight: '800', fontSize: 11 },
  partyHint: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  partyHintT: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', marginTop: 12 },
  err: {
    position: 'absolute',
    top: '42%',
    alignSelf: 'center',
    color: '#FCA5A5',
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    zIndex: 6,
  },
  beautyDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 8,
    backgroundColor: 'rgba(8,8,12,0.72)',
    paddingTop: 10,
    paddingBottom: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  beautyTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    marginLeft: 16,
    marginBottom: 8,
  },
  filterRail: { paddingHorizontal: 14, gap: 12, paddingRight: 20 },
  filterChip: { alignItems: 'center', width: 70 },
  swatch: { width: 56, height: 56, borderRadius: 28 },
  swatchOn: { borderWidth: 3, borderColor: '#FDE68A' },
  filterLabel: {
    color: '#fff',
    fontSize: 11,
    marginTop: 5,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  filterLabelOn: { color: '#FDE68A', fontWeight: '900' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 7 },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  sideBtn: { width: 72, alignItems: 'center', gap: 4 },
  sideBtnOn: { opacity: 1 },
  sideBtnT: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  goWrap: { alignItems: 'center' },
  goBtn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  goT: { color: '#6B7280', fontWeight: '900', fontSize: 22, fontStyle: 'italic' },
  tabs: { flexDirection: 'row', justifyContent: 'center', gap: 36, paddingBottom: 4 },
  tab: { alignItems: 'center', minWidth: 56 },
  tabT: { color: 'rgba(255,255,255,0.55)', fontWeight: '800', fontSize: 16 },
  tabTOn: { color: '#fff' },
  tabBar: { marginTop: 4, width: 28, height: 3, borderRadius: 2, backgroundColor: '#fff' },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  editSheet: {
    backgroundColor: '#1B1D26',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
  editH: { color: '#fff', fontWeight: '900', fontSize: 16, marginBottom: 12 },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  coverT: { color: '#FDE68A', fontWeight: '800' },
  input: {
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  doneBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneT: { color: '#111', fontWeight: '900' },
});
