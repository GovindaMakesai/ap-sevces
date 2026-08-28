/**
 * Second Agora engine for PK rival host video (webview: pkRivalAgoraClient).
 */
export function resolvePkRivalChannel(pk, myChannel) {
  if (!pk) return '';
  const mine = String(myChannel || '');
  const linked = Array.isArray(pk.linkedChannels) ? pk.linkedChannels.map(String) : [];
  if (pk.rivalChannel && String(pk.rivalChannel) !== mine) return String(pk.rivalChannel);
  if (pk.challengerChannel && String(pk.challengerChannel) !== mine) return String(pk.challengerChannel);
  if (pk.targetChannel && String(pk.targetChannel) !== mine) return String(pk.targetChannel);
  if (pk.opponentChannel && String(pk.opponentChannel) !== mine) return String(pk.opponentChannel);
  if (pk.rightChannel && String(pk.rightChannel) !== mine) return String(pk.rightChannel);
  const other = linked.find((c) => c && c !== mine);
  return other || '';
}

export function resolveRivalHostAgoraUid(pk, rivalCh) {
  if (!pk) return null;
  const ch = String(rivalCh || '');
  if (pk.rivalChannel && ch === String(pk.rivalChannel) && pk.rivalAgoraUid != null) {
    return Number(pk.rivalAgoraUid);
  }
  if (pk.challengerChannel && ch === String(pk.challengerChannel) && pk.challengerAgoraUid != null) {
    return Number(pk.challengerAgoraUid);
  }
  if (pk.rivalAgoraUid != null) return Number(pk.rivalAgoraUid);
  if (pk.challengerAgoraUid != null) return Number(pk.challengerAgoraUid);
  return null;
}

export async function stopPkRivalEngine(engineRef) {
  const engine = engineRef?.current;
  engineRef.current = null;
  if (!engine) return;
  try {
    engine.unregisterEventHandler?.({});
  } catch (_e) {}
  try {
    await engine.leaveChannel?.();
  } catch (_e) {}
  try {
    engine.release?.();
  } catch (_e) {}
}

export async function startPkRivalEngine({
  Agora,
  api,
  rivalChannel,
  myChannel,
  pkSnapshot,
  engineRef,
  onHostUid,
}) {
  const ch = String(rivalChannel || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!Agora || !api || !ch || ch === String(myChannel || '')) return null;

  await stopPkRivalEngine(engineRef);

  const tokenRes = await api.post('/live/agora/token', { channel: ch, role: 'audience' });
  const appId = tokenRes.appId || tokenRes.data?.appId;
  const token = tokenRes.token || tokenRes.data?.token || null;
  const uid = Number(tokenRes.uid || tokenRes.data?.uid || 0);
  if (!appId) return null;

  const { createAgoraRtcEngine, ChannelProfileType, ClientRoleType } = Agora;
  const engine = createAgoraRtcEngine();
  engineRef.current = engine;
  const expectedHostUid = resolveRivalHostAgoraUid(pkSnapshot, ch);

  engine.initialize({ appId });
  try {
    engine.enableVideo?.();
    engine.enableAudio?.();
  } catch (_e) {}

  engine.registerEventHandler({
    onJoinChannelSuccess: () => {},
    onUserJoined: (_conn, remote) => {
      if (expectedHostUid == null || Number(remote) === Number(expectedHostUid)) {
        onHostUid?.(remote);
      } else if (expectedHostUid == null) {
        onHostUid?.(remote);
      }
    },
    onUserOffline: (_conn, remote) => {
      onHostUid?.(null, remote);
    },
    onRemoteVideoStateChanged: (_conn, remote, _state, _reason) => {
      if (expectedHostUid == null || Number(remote) === Number(expectedHostUid)) {
        onHostUid?.(remote);
      }
    },
  });

  await engine.joinChannel(token, ch, uid, {
    clientRoleType: ClientRoleType.ClientRoleAudience,
    channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
    publishMicrophoneTrack: false,
    publishCameraTrack: false,
    autoSubscribeAudio: true,
    autoSubscribeVideo: true,
  });

  return engine;
}
