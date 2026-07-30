/**
 * LiveAudioRoute — Phase 2A native Android/iOS audio routing owner.
 *
 * Does NOT know about Agora. RTC / Web only call:
 *   enterPlayback() | enterTalk() | exitTalk() | leaveLive() | reevaluate()
 *
 * States: idle → livePlay ↔ liveTalk → teardown → idle
 *
 * Bluetooth: we avoid thrashing setAudioModeAsync (which fights A2DP/SCO).
 * Redundant same-mode applies within APPLY_COOLDOWN_MS are no-ops.
 */
import { AppState, Platform } from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

export const LiveAudioStates = Object.freeze({
  IDLE: 'idle',
  LIVE_PLAY: 'livePlay',
  LIVE_TALK: 'liveTalk',
  TEARDOWN: 'teardown',
});

const APPLY_COOLDOWN_MS = 2000;

let state = LiveAudioStates.IDLE;
let chain = Promise.resolve();
let debug = false;
let lastAppliedAt = 0;
let lastAppliedMode = null;
let lastFocusEvent = null;
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
  /* Always surface transitions in logcat for A51 / BT field debug */
  try {
    console.warn('[LiveAudioRoute:TX]', event, {
      state,
      lastAppliedMode,
      lastAppliedAt,
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

async function applyIdle() {
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
  emit('session_end', { mode: 'idle', platform: Platform.OS });
}

async function applyLivePlay({ force = false } = {}) {
  if (!force && recentlyApplied('livePlay')) {
    emit('apply_skipped', { mode: 'livePlay', reason: 'cooldown' });
    return;
  }
  /* Playback focus — DuckOthers keeps Bluetooth A2DP hearable. */
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckOthers: true,
    playThroughEarpieceAndroid: false,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  });
  lastAppliedAt = Date.now();
  lastAppliedMode = 'livePlay';
  emit('session_start', { mode: 'livePlay', platform: Platform.OS });
  emit('focus_gain', { mode: 'livePlay' });
}

async function applyLiveTalk({ bluetoothSafe = true, force = false } = {}) {
  if (!force && recentlyApplied('liveTalk')) {
    emit('apply_skipped', { mode: 'liveTalk', reason: 'cooldown' });
    return;
  }
  /* Mic path. DuckOthers so headphones keep playing remote audio. */
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckOthers: true,
    playThroughEarpieceAndroid: false,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  });
  lastAppliedAt = Date.now();
  lastAppliedMode = 'liveTalk';
  emit('session_start', { mode: 'liveTalk', bluetoothSafe, platform: Platform.OS });
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

  /** Audience (or host before mic) — media playback focus. */
  enterPlayback(reason = 'enterPlayback') {
    return run(async () => {
      const force = /force|foreground|nav_enter|webview_load/i.test(String(reason || ''));
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

  /** Host / seat mic — recording-capable session. */
  enterTalk(opts = {}) {
    return run(async () => {
      const reason = opts.reason || 'enterTalk';
      if (state === LiveAudioStates.LIVE_TALK && recentlyApplied('liveTalk')) {
        emit('enterTalk_noop', { reason, state });
        return state;
      }
      emit('transition', { from: state, to: LiveAudioStates.LIVE_TALK, reason });
      state = LiveAudioStates.LIVE_TALK;
      await applyLiveTalk({ bluetoothSafe: opts.bluetoothSafe !== false, force: true });
      return state;
    });
  },

  /** Demote / mute-publish end — leave communication mode, stay in live as audience. */
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

  /** Leave live/party entirely — release focus, restore normal audio. */
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

  /**
   * BT / headset / focus change — re-apply current live mode without Agora knowledge.
   * Cooldown prevents rapid devicechange/speaker posts from killing Bluetooth audio.
   */
  reevaluate(reason = 'reevaluate') {
    return run(async () => {
      emit('route_change', { reason, state });
      if (state === LiveAudioStates.LIVE_TALK) {
        await applyLiveTalk({});
      } else if (state === LiveAudioStates.LIVE_PLAY) {
        await applyLivePlay({});
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
