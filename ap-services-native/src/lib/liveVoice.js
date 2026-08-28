/**
 * Live / party voice helpers — ports web fixes for:
 * - Samsung/OEM quiet host uplink (avoid MODE_IN_COMMUNICATION / enterTalk)
 * - Seat echo (chatroom scenario + AEC, no HW talk-mode loop)
 * - Bluetooth / headphones silence (permission + Agora speaker route sync)
 * - Host hearing seated guests (remote unmute + publisher volumes)
 */
import { Platform, PermissionsAndroid } from 'react-native';
import LiveAudioRoute from './liveAudioRoute';
import ApLiveAudio from '../../modules/ap-live-audio';

const LIVE_TRACK_VOLUME = 100;
const LIVE_PUBLISHER_SEND_VOLUME = 160;
const OEM_PUBLISHER_SEND_VOLUME = 240;
const PUBLISHER_PLAYBACK_VOLUME = 90;
const AUDIENCE_PLAYBACK_VOLUME = 110;

let brandCache = null;
let lastBtSnapshot = null;

function readBrand() {
  if (brandCache) return brandCache;
  try {
    const Device = require('expo-device');
    brandCache = {
      brand: String(Device.brand || ''),
      manufacturer: String(Device.manufacturer || ''),
      modelName: String(Device.modelName || ''),
    };
  } catch (_e) {
    brandCache = { brand: '', manufacturer: '', modelName: '' };
  }
  return brandCache;
}

/** Samsung / Vivo / Oppo / Xiaomi / … — HW AEC ducks host mic in talk mode */
export function isOemHostMicRisk() {
  if (Platform.OS !== 'android') return false;
  const { brand, manufacturer, modelName } = readBrand();
  const blob = `${brand} ${manufacturer} ${modelName}`;
  return /Samsung|SM-[A-Z0-9]|Vivo|iQOO|OPPO|Realme|OnePlus|Xiaomi|Redmi|POCO|Infinix|Tecno|Motorola|moto/i.test(
    blob
  );
}

export function publisherSendVolume() {
  if (isOemHostMicRisk()) return OEM_PUBLISHER_SEND_VOLUME;
  return LIVE_PUBLISHER_SEND_VOLUME;
}

export async function requestBluetoothConnect() {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 31) return true;
  try {
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, {
      title: 'Bluetooth audio',
      message: 'Allow Bluetooth so you can hear live voice on headphones and wireless earbuds.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    return res === PermissionsAndroid.RESULTS.GRANTED;
  } catch (_e) {
    return false;
  }
}

export async function requestMicPermission() {
  if (Platform.OS !== 'android') return true;
  try {
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone',
      message: 'Allow microphone so others can hear you on live and party seats.',
      buttonPositive: 'Allow',
    });
    return res === PermissionsAndroid.RESULTS.GRANTED || res === PermissionsAndroid.RESULTS.LIMITED;
  } catch (_e) {
    return false;
  }
}

/**
 * Android publishers must use playback session (not enterTalk).
 * Talk/recording mode enables Samsung HW AEC that cancels the host uplink.
 */
export async function enterPublisherAudioRoute(reason = 'publisher') {
  await requestBluetoothConnect();
  if (Platform.OS === 'android') {
    return LiveAudioRoute.enterPlayback(reason);
  }
  return LiveAudioRoute.enterTalk({ reason, bluetoothSafe: true });
}

export async function enterAudienceAudioRoute(reason = 'audience') {
  await requestBluetoothConnect();
  return LiveAudioRoute.enterPlayback(reason);
}

export async function hasExternalAudio() {
  try {
    if (await ApLiveAudio.hasBluetoothAudio()) return true;
  } catch (_e) {}
  try {
    if (typeof ApLiveAudio.hasWiredHeadset === 'function' && (await ApLiveAudio.hasWiredHeadset())) {
      return true;
    }
  } catch (_e) {}
  return false;
}

/** Align Agora speakerphone with phone speaker vs BT/headphones */
export async function syncAgoraAudioRoute(engine, { speakerWanted = true, force = false } = {}) {
  if (!engine) return { external: false };
  const external = await hasExternalAudio();
  const snap = external ? 'ext' : 'spk';
  const flipped = lastBtSnapshot !== snap;
  lastBtSnapshot = snap;
  const useSpeaker = speakerWanted && !external;
  try {
    engine.setDefaultAudioRouteToSpeakerphone?.(useSpeaker);
  } catch (_e) {}
  try {
    engine.setEnableSpeakerphone?.(useSpeaker);
  } catch (_e) {}
  /* Only re-open the audio session when the route actually changed — not on every poll */
  if (force || flipped) {
    try {
      await LiveAudioRoute.reevaluate(flipped ? 'bluetooth_device_change' : 'bluetooth_or_headset');
    } catch (_e) {}
  }
  return { external, useSpeaker, flipped };
}

/**
 * Profile + volumes + AEC before/after join. Call after engine.initialize.
 */
export function configureAgoraVoice(engine, { publishing = false, party = false } = {}) {
  if (!engine) return;
  try {
    const Agora = require('react-native-agora');
    const profile =
      Agora.AudioProfileType?.AudioProfileMusicHighQuality ??
      Agora.AudioProfileType?.AudioProfileMusicStandard ??
      4;
    const scenario =
      Agora.AudioScenarioType?.AudioScenarioChatroom ??
      Agora.AudioScenarioType?.AudioScenarioDefault ??
      5;
    engine.setAudioProfile?.(profile, scenario);
    engine.setAudioScenario?.(scenario);
  } catch (_e) {}

  try {
    engine.enableAudio?.();
  } catch (_e) {}

  try {
    engine.enableInEarMonitoring?.(false);
  } catch (_e) {}

  /* Keep software AEC; disable extra AGC/ANS on OEM (ducks/delays uplink) */
  try {
    engine.setParameters?.('{"che.audio.aec.enable":true}');
    if (isOemHostMicRisk()) {
      engine.setParameters?.('{"che.audio.agc.enable":false}');
      engine.setParameters?.('{"che.audio.ans.enable":false}');
      engine.setParameters?.('{"che.audio.ns.enable":false}');
    } else {
      engine.setParameters?.('{"che.audio.agc.enable":true}');
      engine.setParameters?.('{"che.audio.ans.enable":true}');
    }
  } catch (_e) {}

  try {
    engine.adjustRecordingSignalVolume?.(publishing ? publisherSendVolume() : LIVE_TRACK_VOLUME);
  } catch (_e) {}
  try {
    /* Publishers: slightly lower playback to cut echo; audiences: full clear voice */
    engine.adjustPlaybackSignalVolume?.(
      publishing ? (party ? PUBLISHER_PLAYBACK_VOLUME - 5 : PUBLISHER_PLAYBACK_VOLUME) : AUDIENCE_PLAYBACK_VOLUME
    );
  } catch (_e) {}

  try {
    engine.muteAllRemoteAudioStreams?.(false);
  } catch (_e) {}
}

/** Ensure every remote publisher video stays subscribed (host ↔ audience). */
export function ensureRemoteVideoOpen(engine, remoteUid) {
  if (!engine) return;
  try {
    engine.muteAllRemoteVideoStreams?.(false);
  } catch (_e) {}
  if (remoteUid != null && remoteUid !== 0) {
    try {
      engine.muteRemoteVideoStream?.(Number(remoteUid), false);
    } catch (_e) {}
  }
}

/** Channel media options that must stay on every partial update — never drop video subscription. */
export function audienceMediaOptions(extra = {}) {
  return {
    autoSubscribeAudio: true,
    autoSubscribeVideo: true,
    publishMicrophoneTrack: false,
    publishCameraTrack: false,
    ...extra,
  };
}

export function publisherMediaOptions(extra = {}) {
  return {
    autoSubscribeAudio: true,
    autoSubscribeVideo: true,
    publishMicrophoneTrack: true,
    publishCameraTrack: true,
    ...extra,
  };
}

/** Ensure every remote publisher can be heard (host ↔ seats). */
export function ensureRemoteAudioOpen(engine, remoteUid) {
  if (!engine) return;
  try {
    engine.muteAllRemoteAudioStreams?.(false);
  } catch (_e) {}
  if (remoteUid != null && remoteUid !== 0) {
    try {
      engine.muteRemoteAudioStream?.(Number(remoteUid), false);
    } catch (_e) {}
    try {
      engine.adjustUserPlaybackSignalVolume?.(Number(remoteUid), AUDIENCE_PLAYBACK_VOLUME);
    } catch (_e) {}
  }
}

export async function promoteToPublisher({ api, engine, channel, muted = false }) {
  if (!engine || !channel) return false;
  await requestMicPermission();
  await requestBluetoothConnect();
  try {
    const tokenRes = await api.post('/live/agora/token', {
      channel: String(channel).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
      role: 'publisher',
    });
    const token = tokenRes.token || tokenRes.data?.token;
    if (token) engine.renewToken?.(token);
  } catch (_e) {
    /* seat may not be approved yet on server — still try local role switch */
  }

  try {
    const Agora = require('react-native-agora');
    const role = Agora.ClientRoleType?.ClientRoleBroadcaster;
    if (role != null) engine.setClientRole?.(role);
    engine.updateChannelMediaOptions?.(
      publisherMediaOptions({
        publishMicrophoneTrack: true,
        publishCameraTrack: false,
      })
    );
  } catch (_e) {
    try {
      engine.setClientRole?.(1);
    } catch (_e2) {}
  }

  try {
    engine.enableLocalAudio?.(true);
  } catch (_e) {}
  try {
    engine.muteLocalAudioStream?.(Boolean(muted));
  } catch (_e) {}

  configureAgoraVoice(engine, { publishing: true, party: true });
  ensureRemoteAudioOpen(engine);
  ensureRemoteVideoOpen(engine);
  await enterPublisherAudioRoute('seat_promote');
  await syncAgoraAudioRoute(engine, { speakerWanted: true, force: true });
  return true;
}

export async function demoteToAudience({ api, engine, channel }) {
  if (!engine) return;
  try {
    engine.updateChannelMediaOptions?.(
      audienceMediaOptions({ publishMicrophoneTrack: false, publishCameraTrack: false })
    );
  } catch (_e) {}
  try {
    const Agora = require('react-native-agora');
    const role = Agora.ClientRoleType?.ClientRoleAudience;
    if (role != null) engine.setClientRole?.(role);
  } catch (_e) {}
  try {
    engine.enableLocalAudio?.(false);
  } catch (_e) {}
  try {
    if (api && channel) {
      const tokenRes = await api.post('/live/agora/token', {
        channel: String(channel).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
        role: 'audience',
      });
      const token = tokenRes.token || tokenRes.data?.token;
      if (token) engine.renewToken?.(token);
    }
  } catch (_e) {}
  try {
    engine.adjustRecordingSignalVolume?.(LIVE_TRACK_VOLUME);
    engine.adjustPlaybackSignalVolume?.(AUDIENCE_PLAYBACK_VOLUME);
  } catch (_e) {}
  await LiveAudioRoute.exitTalk('seat_leave');
  await syncAgoraAudioRoute(engine, { speakerWanted: true, force: true });
}

export default {
  isOemHostMicRisk,
  publisherSendVolume,
  requestBluetoothConnect,
  requestMicPermission,
  enterPublisherAudioRoute,
  enterAudienceAudioRoute,
  syncAgoraAudioRoute,
  configureAgoraVoice,
  promoteToPublisher,
  demoteToAudience,
  hasExternalAudio,
  ensureRemoteAudioOpen,
  ensureRemoteVideoOpen,
  audienceMediaOptions,
  publisherMediaOptions,
};
