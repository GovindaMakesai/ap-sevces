import { Platform } from 'react-native';

const stub = {
  hasBluetoothAudio: () => false,
  preferBluetoothPlayback: async () => ({ ok: false, reason: 'unavailable' }),
  preferBluetoothTalk: async () => ({ ok: false, reason: 'unavailable' }),
  clearRouteOverrides: async () => ({ ok: true }),
};

function loadNative() {
  if (Platform.OS !== 'android') return stub;
  try {
    // eslint-disable-next-line global-require
    const { requireNativeModule } = require('expo-modules-core');
    return requireNativeModule('ApLiveAudio');
  } catch (_e) {
    return stub;
  }
}

const Native = loadNative();

export async function hasBluetoothAudio() {
  try {
    return Boolean(Native.hasBluetoothAudio());
  } catch (_e) {
    return false;
  }
}

/** Audience / playback — SCO/HFP when a headset is connected (A2DP is dropped in WebRTC call mode). */
export async function preferBluetoothPlayback() {
  try {
    return await Native.preferBluetoothPlayback();
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

/** Host / seat mic on BT headset — SCO / communication device when needed. */
export async function preferBluetoothTalk() {
  try {
    return await Native.preferBluetoothTalk();
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

export async function clearRouteOverrides() {
  try {
    return await Native.clearRouteOverrides();
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}

export default {
  hasBluetoothAudio,
  preferBluetoothPlayback,
  preferBluetoothTalk,
  clearRouteOverrides,
};
