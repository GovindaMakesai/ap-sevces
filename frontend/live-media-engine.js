/**
 * AP Live Media Engine — single owner for Agora remote audio playback,
 * volume/AEC compensation, and non-destructive health recovery.
 *
 * Design rules (production):
 * 1. One remote audio path: Agora RemoteAudioTrack.play(sink) + setVolume.
 * 2. Never stop()/unsubscribe remotes to "fix silence" (AEC duck ≠ dead track).
 * 3. Web Audio / DomSink are fallbacks only when play() throws — never simultaneous.
 * 4. Role-based playback volume applied synchronously on publish / role change.
 * 5. One health loop with hysteresis; remount only if MediaStreamTrack ended.
 *
 * social-live.js owns sockets, seats, UI. This module owns media playback policy.
 */
(function (global) {
  'use strict';

  const BUILD = '20260718-media-engine';
  const VOL_AUDIENCE = 100;
  /** Agora remote volume max — counters WebRTC AEC ducking when local mic is open */
  const VOL_PUBLISHER = 400;

  const state = {
    log: null,
    isPublisher: false,
    shouldHear: () => true,
    requestSpeaker: () => {},
    unlockAudio: async () => {},
    sinks: new Map(),
    lastHealthAt: 0,
    remountAt: new Map(),
    healthTimer: null,
    stats: {
      playOk: 0,
      playFail: 0,
      remount: 0,
      boost: 0,
      skipHealthy: 0,
    },
  };

  function log(msg, data) {
    try {
      if (typeof state.log === 'function') state.log(msg, data);
      else if (global.console?.debug) global.console.debug('[LiveMedia]', msg, data || '');
    } catch (_e) {}
  }

  function configure(opts = {}) {
    if (opts.log) state.log = opts.log;
    if (typeof opts.shouldHear === 'function') state.shouldHear = opts.shouldHear;
    if (typeof opts.requestSpeaker === 'function') state.requestSpeaker = opts.requestSpeaker;
    if (typeof opts.unlockAudio === 'function') state.unlockAudio = opts.unlockAudio;
    log('engine configure', { build: BUILD });
  }

  function setPublisherMode(isPublisher) {
    const next = Boolean(isPublisher);
    if (state.isPublisher === next) return;
    state.isPublisher = next;
    log('publisher_mode', { isPublisher: next, volume: playbackVolume() });
  }

  function playbackVolume() {
    return state.isPublisher ? VOL_PUBLISHER : VOL_AUDIENCE;
  }

  function getOrCreateSink(uid) {
    const key = String(uid);
    let el = state.sinks.get(key);
    if (el && el.isConnected) return el;
    el = global.document?.getElementById?.(`apRemoteAudioSink-${key}`);
    if (!el && global.document?.body) {
      el = global.document.createElement('audio');
      el.id = `apRemoteAudioSink-${key}`;
      el.autoplay = true;
      el.controls = false;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      el.style.cssText =
        'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      global.document.body.appendChild(el);
    }
    if (el) state.sinks.set(key, el);
    return el;
  }

  function removeSink(uid) {
    const key = String(uid);
    const el = state.sinks.get(key) || global.document?.getElementById?.(`apRemoteAudioSink-${key}`);
    state.sinks.delete(key);
    if (!el) return;
    try {
      el.pause?.();
      el.srcObject = null;
      el.removeAttribute('src');
      el.remove();
    } catch (_e) {}
  }

  function clearAllSinks() {
    const keys = [...state.sinks.keys()];
    keys.forEach(removeSink);
  }

  function trackEnded(user) {
    try {
      const mst = user?.audioTrack?.getMediaStreamTrack?.();
      return Boolean(mst && mst.readyState === 'ended');
    } catch (_e) {
      return false;
    }
  }

  /**
   * Primary remote audio play — single path.
   * Returns true if playback was started or already healthy.
   */
  async function playRemoteAudio(user, { force = false } = {}) {
    if (!user?.audioTrack) return false;
    if (!state.shouldHear()) return false;

    try {
      state.requestSpeaker();
      await state.unlockAudio();
    } catch (_e) {}

    const vol = playbackVolume();
    try {
      user.audioTrack.setVolume?.(vol);
      if (typeof user.audioTrack.setMuted === 'function') {
        await user.audioTrack.setMuted(false).catch?.(() => {});
      }
    } catch (_e2) {}

    /* Already playing and track alive — do not re-play (avoids A/V desync) */
    if (!force && user.audioTrack.isPlaying === true && !trackEnded(user)) {
      state.stats.skipHealthy += 1;
      return true;
    }

    const sink = getOrCreateSink(user.uid);
    if (sink) {
      sink.muted = false;
      sink.defaultMuted = false;
      sink.volume = 1;
      try {
        sink.removeAttribute('muted');
      } catch (_e3) {}
    }

    try {
      const p = sink ? user.audioTrack.play(sink) : user.audioTrack.play();
      if (p && typeof p.then === 'function') await p;
      state.stats.playOk += 1;
      log('remote_audio_play_ok', { uid: user.uid, vol, force });
      return true;
    } catch (err) {
      state.stats.playFail += 1;
      log('remote_audio_play_fail', { uid: user.uid, err: err?.message || String(err) });
      /* Fallback: pipe MST into <audio> without cloning / Web Audio stack */
      try {
        const mst = user.audioTrack.getMediaStreamTrack?.();
        if (!mst || mst.readyState === 'ended' || !sink) return false;
        sink.srcObject = new MediaStream([mst]);
        const playP = sink.play?.();
        if (playP && typeof playP.then === 'function') await playP;
        return !sink.paused;
      } catch (_fb) {
        return false;
      }
    }
  }

  function boostAll(client) {
    const vol = playbackVolume();
    state.stats.boost += 1;
    try {
      for (const user of client?.remoteUsers || []) {
        try {
          if (!user.audioTrack) continue;
          user.audioTrack.setVolume?.(vol);
          if (typeof user.audioTrack.setMuted === 'function') {
            user.audioTrack.setMuted(false).catch?.(() => {});
          }
        } catch (_e) {}
      }
    } catch (_e2) {}
    try {
      state.sinks.forEach((el) => {
        if (!el) return;
        el.muted = false;
        el.volume = 1;
      });
    } catch (_e3) {}
    log('boost_all', { vol, remotes: client?.remoteUsers?.length || 0 });
  }

  /**
   * Ensure every remote with hasAudio is playing. Never unsubscribe.
   */
  async function ensureAllRemoteAudio(client, { force = false } = {}) {
    if (!client || !state.shouldHear()) return false;
    const remotes = (client.remoteUsers || []).filter((u) => u.hasAudio || u.audioTrack);
    let any = false;
    await Promise.all(
      remotes.map(async (user) => {
        try {
          if (!user.audioTrack) return;
          const ok = await playRemoteAudio(user, { force });
          if (ok) any = true;
        } catch (_e) {}
      })
    );
    boostAll(client);
    return any;
  }

  /**
   * Destructive remount — ONLY when MediaStreamTrack is ended.
   * Caller must provide subscribeFn(user) that re-subscribes audio.
   */
  async function remountIfDead(user, subscribeFn) {
    if (!user || !trackEnded(user)) return false;
    const uid = String(user.uid);
    const last = state.remountAt.get(uid) || 0;
    if (Date.now() - last < 15000) return false;
    state.remountAt.set(uid, Date.now());
    state.stats.remount += 1;
    log('remount_dead_track', { uid });
    removeSink(uid);
    if (typeof subscribeFn === 'function') {
      await subscribeFn(user);
    }
    return playRemoteAudio(user, { force: true });
  }

  /**
   * Single health loop — replaces overlapping silent/kickstart thrash.
   */
  function startHealthWatch(getClient, opts = {}) {
    const intervalMs = opts.intervalMs || 6000;
    stopHealthWatch();
    state.healthTimer = global.setInterval(() => {
      try {
        if (global.document?.visibilityState === 'hidden') return;
        if (Date.now() - state.lastHealthAt < 4000) return;
        const client = typeof getClient === 'function' ? getClient() : null;
        if (!client || !state.shouldHear()) return;
        state.lastHealthAt = Date.now();
        const remotes = client.remoteUsers || [];
        remotes.forEach((user) => {
          if (!user.hasAudio && !user.audioTrack) return;
          if (trackEnded(user)) {
            /* Caller may wire remount via onDeadTrack */
            if (typeof opts.onDeadTrack === 'function') opts.onDeadTrack(user);
            return;
          }
          if (user.audioTrack && user.audioTrack.isPlaying === false) {
            playRemoteAudio(user, { force: false }).catch(() => {});
          } else if (user.audioTrack) {
            try {
              user.audioTrack.setVolume?.(playbackVolume());
            } catch (_e) {}
          }
        });
      } catch (_e) {}
    }, intervalMs);
    log('health_watch_start', { intervalMs });
  }

  function stopHealthWatch() {
    if (state.healthTimer) {
      global.clearInterval(state.healthTimer);
      state.healthTimer = null;
    }
  }

  function getStats() {
    return { ...state.stats, build: BUILD, isPublisher: state.isPublisher, volume: playbackVolume() };
  }

  function dispose() {
    stopHealthWatch();
    clearAllSinks();
    state.remountAt.clear();
    log('engine_dispose');
  }

  const api = {
    BUILD,
    configure,
    setPublisherMode,
    playbackVolume,
    playRemoteAudio,
    ensureAllRemoteAudio,
    boostAll,
    remountIfDead,
    startHealthWatch,
    stopHealthWatch,
    removeSink,
    clearAllSinks,
    getStats,
    dispose,
    trackEnded,
  };

  global.APLiveMedia = api;
})(typeof window !== 'undefined' ? window : globalThis);
