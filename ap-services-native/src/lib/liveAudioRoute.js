/**
 * LiveAudioRoute — native Android/iOS audio routing owner.
 *
 * Bluetooth: expo-av playThroughEarpieceAndroid:false forces speakerphone ON,
 * which silences A2DP. When BT is connected we set playThroughEarpieceAndroid
 * true (speakerphone off) and ApLiveAudio clears any speaker steal.
 */
import { AppState, Platform } from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import ApLiveAudio from '../../modules/ap-live-audio';

export const LiveAudioStates = Object.freeze({
  IDLE: 'idle',
  LIVE_PLAY: 'livePlay',
  LIVE_TALK: 'liveTalk',
  TEARDOWN: 'teardown',
});

const APPLY_COOLDOWN_MS = 900;

let state = LiveAudioStates.IDLE;
let chain = Promise.resolve();
let debug = false;
let lastAppliedAt = 0;
let lastAppliedMode = null;
let lastFocusEvent = null;
let lastBtRoute = null;
const listeners = new Set();

function log(event, data) {
  lastFocusEvent = { t: Date.now(), event, state, ...(data || {}) };
  if (!debug && !__DEV__) return;
  try {
    console.warn('[LiveAudioRoute]', event, { state, ...(data || {}) });
  } catch (_e) {}
}

function emit(event, data) {
  log(event, data);
  try {
    console.warn('[LiveAudioRoute:TX]', event, {
      state,
      lastAppliedMode,
      lastAppliedAt,
      lastBtRoute,
      platform: Platform.OS,
      ...(data || {}),
    });
  } catch (_e) {}
  listeners.forEach((fn) => {
    try {
      fn({ event, state, ...(data || {}) });
    } catch (_e) {}
  });
}

function run(fn) {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

function recentlyApplied(mode) {
  return lastAppliedMode === mode && Date.now() - lastAppliedAt < APPLY_COOLDOWN_MS;
}

async function detectBluetooth() {
  if (Platform.OS !== 'android') return false;
  try {
    return Boolean(await ApLiveAudio.hasBluetoothAudio());
  } catch (_e) {
    return false;
  }
}

async function applyBluetoothRoute(kind) {
  if (Platform.OS !== 'android') return null;
  try {
    const hasBt = await ApLiveAudio.hasBluetoothAudio();
    if (!hasBt) {
      lastBtRoute = { bluetooth: false, kind };
      return lastBtRoute;
    }
    const result =
      kind === 'talk'
        ? await ApLiveAudio.preferBluetoothTalk()
        : await ApLiveAudio.preferBluetoothPlayback();
    lastBtRoute = { ...(result || {}), kind };
    emit('bluetooth_route', lastBtRoute);
    return lastBtRoute;
  } catch (err) {
    lastBtRoute = { ok: false, error: String(err?.message || err), kind };
    emit('bluetooth_route_error', lastBtRoute);
    return lastBtRoute;
  }
}

async function applyIdle() {
  try {
    await ApLiveAudio.clearRouteOverrides();
  } catch (_e) {}
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckOthers: true,
    playThroughEarpieceAndroid: false,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  });
  lastAppliedAt = Date.now();
  lastAppliedMode = 'idle';
  lastBtRoute = null;
  emit('session_end', { mode: 'idle', platform: Platform.OS });
}

async function applyLivePlay({ force = false } = {}) {
  if (!force && recentlyApplied('livePlay')) {
    emit('apply_skipped', { mode: 'livePlay', reason: 'cooldown' });
    await applyBluetoothRoute('playback');
    return;
  }
  const hasBt = await detectBluetooth();
  /*
   * playThroughEarpieceAndroid:
   *   false → expo-av setSpeakerphoneOn(true)  — correct for phone speaker
   *   true  → speakerphone OFF — required so Bluetooth A2DP can carry WebView voice
   */
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckOthers: true,
    playThroughEarpieceAndroid: hasBt,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  });
  lastAppliedAt = Date.now();
  lastAppliedMode = 'livePlay';
  await applyBluetoothRoute('playback');
  emit('session_start', { mode: 'livePlay', bluetooth: hasBt, platform: Platform.OS });
  emit('focus_gain', { mode: 'livePlay' });
}

async function applyLiveTalk({ bluetoothSafe = true, force = false } = {}) {
  if (!force && recentlyApplied('liveTalk')) {
    emit('apply_skipped', { mode: 'liveTalk', reason: 'cooldown' });
    if (bluetoothSafe) await applyBluetoothRoute('talk');
    return;
  }
  const hasBt = bluetoothSafe ? await detectBluetooth() : false;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckOthers: true,
    playThroughEarpieceAndroid: hasBt,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  });
  lastAppliedAt = Date.now();
  lastAppliedMode = 'liveTalk';
  if (bluetoothSafe) await applyBluetoothRoute('talk');
  emit('session_start', {
    mode: 'liveTalk',
    bluetoothSafe,
    bluetooth: hasBt,
    platform: Platform.OS,
  });
  emit('focus_gain', { mode: 'liveTalk' });
}

async function applyTeardown() {
  state = LiveAudioStates.TEARDOWN;
  emit('transition', { to: LiveAudioStates.TEARDOWN });
  try {
    await applyIdle();
  } finally {
    state = LiveAudioStates.IDLE;
    emit('transition', { to: LiveAudioStates.IDLE });
    emit('focus_loss', { mode: 'idle' });
  }
}

export const LiveAudioRoute = {
  STATES: LiveAudioStates,

  getState() {
    return state;
  },

  getDebugSnapshot() {
    return {
      state,
      lastAppliedAt,
      lastAppliedMode,
      lastFocusEvent,
      lastBtRoute,
      platform: Platform.OS,
      debug,
      appState: AppState.currentState,
    };
  },

  setDebug(enabled) {
    debug = Boolean(enabled);
    emit('debug', { enabled: debug });
  },

  subscribe(fn) {
    if (typeof fn === 'function') listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Android publishers: playback session only (Samsung HW AEC in talk mode cancels uplink). */
  enterPublisher(reason = 'enterPublisher') {
    if (Platform.OS === 'android') {
      return LiveAudioRoute.enterPlayback(reason);
    }
    return LiveAudioRoute.enterTalk({ reason, bluetoothSafe: true });
  },

  enterPlayback(reason = 'enterPlayback') {
    return run(async () => {
      const force = /force|foreground|nav_enter|webview_load|bluetooth|device/i.test(
        String(reason || '')
      );
      if (state === LiveAudioStates.LIVE_PLAY) {
        await applyLivePlay({ force });
        emit('reevaluate', { reason, state });
        return state;
      }
      emit('transition', { from: state, to: LiveAudioStates.LIVE_PLAY, reason });
      state = LiveAudioStates.LIVE_PLAY;
      await applyLivePlay({ force: true });
      return state;
    });
  },

  enterTalk(opts = {}) {
    return run(async () => {
      const reason = opts.reason || 'enterTalk';
      if (state === LiveAudioStates.LIVE_TALK && recentlyApplied('liveTalk')) {
        emit('enterTalk_noop', { reason, state });
        if (opts.bluetoothSafe !== false) await applyBluetoothRoute('talk');
        return state;
      }
      emit('transition', { from: state, to: LiveAudioStates.LIVE_TALK, reason });
      state = LiveAudioStates.LIVE_TALK;
      await applyLiveTalk({ bluetoothSafe: opts.bluetoothSafe !== false, force: true });
      return state;
    });
  },

  exitTalk(reason = 'exitTalk') {
    return run(async () => {
      if (state !== LiveAudioStates.LIVE_TALK && state !== LiveAudioStates.LIVE_PLAY) {
        emit('exitTalk_skipped', { reason, state });
        return state;
      }
      emit('transition', { from: state, to: LiveAudioStates.LIVE_PLAY, reason });
      state = LiveAudioStates.LIVE_PLAY;
      await applyLivePlay({ force: true });
      emit('exit_communication_mode', { reason });
      return state;
    });
  },

  leaveLive(reason = 'leaveLive') {
    return run(async () => {
      if (state === LiveAudioStates.IDLE) {
        emit('leaveLive_noop', { reason });
        return state;
      }
      emit('transition', { from: state, to: LiveAudioStates.TEARDOWN, reason });
      await applyTeardown();
      return state;
    });
  },

  reevaluate(reason = 'reevaluate') {
    return run(async () => {
      emit('route_change', { reason, state });
      const force = /bluetooth|device|headset|bt_|force|change/i.test(String(reason || ''));
      if (state === LiveAudioStates.LIVE_TALK) {
        await applyLiveTalk({ force: true });
      } else if (state === LiveAudioStates.LIVE_PLAY) {
        await applyLivePlay({ force: true });
      }
      return state;
    });
  },

  onAppForeground() {
    if (state === LiveAudioStates.LIVE_PLAY || state === LiveAudioStates.LIVE_TALK) {
      return LiveAudioRoute.reevaluate('app_foreground');
    }
    return Promise.resolve(state);
  },
};

export default LiveAudioRoute;
