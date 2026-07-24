/**
 * AP Live Media Engine — simple, stable Agora remote audio.
 *
 * History: Web Audio gain / MediaElementSource / mute-sink loops caused
 * choppy or "stuck" voice across lives. This build keeps one clean path only.
 *
 * Rules:
 * 1. One path: RemoteAudioTrack.play(htmlAudioSink) + setVolume(100).
 * 2. Never mute sinks for "boost".
 * 3. Never force-replay healthy tracks on a timer.
 * 4. Health watch only recovers paused sinks / ended tracks (with hysteresis).
 */
(function (global) {
  'use strict';

  const BUILD = '20260724-audio-calm';
  /* Agora default remote volume — boosted values caused fish-market loudness */
  const VOL = 100;

  const state = {
    log: null,
    isPublisher: false,
    shouldHear: () => true,
    requestSpeaker: () => {},
    unlockAudio: async () => {},
    sinks: new Map(),
    lastHealthAt: 0,
    remountAt: new Map(),
    quietTicks: new Map(),
    healthTimer: null,
    stats: {
      playOk: 0,
      playFail: 0,
      remount: 0,
      boost: 0,
      skipHealthy: 0,
      forceReplay: 0,
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
    log('publisher_mode', { isPublisher: next });
  }

  function playbackVolume() {
    return VOL;
  }

  function getOrCreateSink(uid) {
    const key = String(uid);
    let el = state.sinks.get(key);
    if (el && el.isConnected) return el;
    el = global.document?.getElementById?.(`apRemoteAudioSink-${key}`);
    if (!el && global.document?.body) {
      el = global.document.createElement('audio');
      el.id = `apRemoteAudioSink-${key}`;
      el.className = 'ap-remote-audio-sink';
      el.dataset.apRemoteAudio = '1';
      el.autoplay = true;
      el.controls = false;
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      el.muted = false;
      el.volume = 1;
      el.style.cssText =
        'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      global.document.body.appendChild(el);
    }
    if (el) {
      el.muted = false;
      el.volume = 1;
      state.sinks.set(key, el);
    }
    return el;
  }

  function removeSink(uid) {
    const key = String(uid);
    const el = state.sinks.get(key) || global.document?.getElementById?.(`apRemoteAudioSink-${key}`);
    state.sinks.delete(key);
    state.quietTicks.delete(key);
    if (!el) return;
    try {
      el.pause?.();
      el.srcObject = null;
      el.removeAttribute('src');
      el.remove();
    } catch (_e) {}
  }

  function clearAllSinks() {
    [...state.sinks.keys()].forEach(removeSink);
  }

  function trackEnded(user) {
    try {
      const mst = user?.audioTrack?.getMediaStreamTrack?.();
      return Boolean(mst && mst.readyState === 'ended');
    } catch (_e) {
      return false;
    }
  }

  function sinkNeedsReplay(uid) {
    try {
      const el = state.sinks.get(String(uid)) || global.document?.getElementById?.(`apRemoteAudioSink-${uid}`);
      if (!el) return false;
      return Boolean(el.paused);
    } catch (_e) {
      return false;
    }
  }

  function trackLooksSilent(user) {
    try {
      const t = user?.audioTrack;
      if (!t) return true;
      if (t.isPlaying === false) return true;
      return sinkNeedsReplay(user.uid);
    } catch (_e) {
      return false;
    }
  }

  async function playRemoteAudio(user, { force = false } = {}) {
    if (!user?.audioTrack) return false;
    if (!state.shouldHear()) return false;

    try {
      state.requestSpeaker();
      await state.unlockAudio();
    } catch (_e) {}

    try {
      user.audioTrack.setVolume?.(VOL);
      if (typeof user.audioTrack.setMuted === 'function') {
        await user.audioTrack.setMuted(false).catch?.(() => {});
      }
    } catch (_e2) {}

    const sinkBroken = sinkNeedsReplay(user.uid);
    if (!force && !sinkBroken && user.audioTrack.isPlaying === true && !trackEnded(user)) {
      state.stats.skipHealthy += 1;
      const sink = state.sinks.get(String(user.uid));
      if (sink) {
        sink.muted = false;
        sink.volume = 1;
      }
      return true;
    }
    if (force || sinkBroken) state.stats.forceReplay += 1;

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
      if (sink) {
        sink.muted = false;
        sink.volume = 1;
        if (sink.paused) {
          try {
            const sp = sink.play?.();
            if (sp && typeof sp.then === 'function') await sp.catch?.(() => {});
          } catch (_sp) {}
        }
      }
      state.stats.playOk += 1;
      state.quietTicks.set(String(user.uid), 0);
      log('remote_audio_play_ok', { uid: user.uid, force: Boolean(force) });
      return true;
    } catch (err) {
      state.stats.playFail += 1;
      log('remote_audio_play_fail', { uid: user.uid, err: err?.message || String(err) });
      try {
        const mst = user.audioTrack.getMediaStreamTrack?.();
        if (!mst || mst.readyState === 'ended' || !sink) return false;
        sink.srcObject = new MediaStream([mst]);
        sink.muted = false;
        sink.volume = 1;
        const playP = sink.play?.();
        if (playP && typeof playP.then === 'function') await playP;
        return !sink.paused;
      } catch (_fb) {
        return false;
      }
    }
  }

  function boostAll(client) {
    state.stats.boost += 1;
    try {
      for (const user of client?.remoteUsers || []) {
        try {
          if (!user.audioTrack) continue;
          user.audioTrack.setVolume?.(VOL);
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
        if (el.paused) {
          try {
            el.play?.()?.catch?.(() => {});
          } catch (_e4) {}
        }
      });
    } catch (_e3) {}
  }

  async function ensureAllRemoteAudio(client, { force = false } = {}) {
    const status = await ensureAllRemoteAudioDetailed(client, { force });
    return Boolean(status?.allOk);
  }

  async function ensureAllRemoteAudioDetailed(client, { force = false } = {}) {
    if (!client || !state.shouldHear()) {
      return { allOk: false, okCount: 0, needCount: 0, missing: [], silent: [] };
    }
    const remotes = (client.remoteUsers || []).filter((u) => u.hasAudio || u.audioTrack);
    const missing = [];
    const silent = [];
    let okCount = 0;
    await Promise.all(
      remotes.map(async (user) => {
        try {
          if (!user.audioTrack) {
            missing.push(user.uid);
            return;
          }
          const needForce = force || sinkNeedsReplay(user.uid) || user.audioTrack.isPlaying !== true;
          const ok = await playRemoteAudio(user, { force: needForce });
          if (ok && !trackLooksSilent(user)) okCount += 1;
          else if (!ok) silent.push(user.uid);
        } catch (_e) {
          silent.push(user?.uid);
        }
      })
    );
    boostAll(client);
    const needCount = remotes.length;
    const allOk = needCount > 0 && okCount >= needCount && missing.length === 0;
    return { allOk, okCount, needCount, missing, silent };
  }

  async function meshRefresh(client) {
    if (!client || !state.shouldHear()) return false;
    return ensureAllRemoteAudio(client, { force: false });
  }

  async function remountIfDead(user, subscribeFn) {
    if (!user || !trackEnded(user)) return false;
    const uid = String(user.uid);
    const last = state.remountAt.get(uid) || 0;
    if (Date.now() - last < 8000) return false;
    state.remountAt.set(uid, Date.now());
    state.stats.remount += 1;
    removeSink(uid);
    if (typeof subscribeFn === 'function') await subscribeFn(user);
    return playRemoteAudio(user, { force: true });
  }

  function startHealthWatch(getClient, opts = {}) {
    const baseInterval = opts.intervalMs || 5000;
    stopHealthWatch();
    state.healthTimer = global.setInterval(() => {
      try {
        if (global.document?.visibilityState === 'hidden') return;
        const client = typeof getClient === 'function' ? getClient() : null;
        if (!client || !state.shouldHear()) return;
        if (Date.now() - state.lastHealthAt < 4500) return;
        state.lastHealthAt = Date.now();

        const remotes = (client.remoteUsers || []).filter((u) => u.hasAudio || u.audioTrack);
        remotes.forEach((user) => {
          if (trackEnded(user)) {
            if (typeof opts.onDeadTrack === 'function') opts.onDeadTrack(user);
            return;
          }
          if (!user.audioTrack) {
            if (typeof opts.onMissingTrack === 'function') opts.onMissingTrack(user);
            return;
          }
          const uid = String(user.uid);
          if (trackLooksSilent(user)) {
            const ticks = (state.quietTicks.get(uid) || 0) + 1;
            state.quietTicks.set(uid, ticks);
            /* Only recover after sustained pause — avoid stuck thrash */
            if (ticks >= 3) {
              playRemoteAudio(user, { force: true }).catch(() => {});
            }
            if (ticks >= 6 && typeof opts.onStuckSilent === 'function') {
              opts.onStuckSilent(user);
              state.quietTicks.set(uid, 0);
            }
          } else {
            state.quietTicks.set(uid, 0);
            try {
              user.audioTrack.setVolume?.(VOL);
            } catch (_e) {}
          }
        });
        if (remotes.length) boostAll(client);
      } catch (_e) {}
    }, baseInterval);
    log('health_watch_start', { intervalMs: baseInterval });
  }

  function stopHealthWatch() {
    if (state.healthTimer) {
      global.clearInterval(state.healthTimer);
      state.healthTimer = null;
    }
  }

  function getStats() {
    return { ...state.stats, build: BUILD, isPublisher: state.isPublisher, volume: VOL };
  }

  function dispose() {
    stopHealthWatch();
    clearAllSinks();
    state.remountAt.clear();
    state.quietTicks.clear();
    log('engine_dispose');
  }

  global.APLiveMedia = {
    BUILD,
    configure,
    setPublisherMode,
    playbackVolume,
    playRemoteAudio,
    ensureAllRemoteAudio,
    ensureAllRemoteAudioDetailed,
    meshRefresh,
    boostAll,
    remountIfDead,
    startHealthWatch,
    stopHealthWatch,
    removeSink,
    clearAllSinks,
    getStats,
    dispose,
    trackEnded,
    trackLooksSilent,
  };
})(typeof window !== 'undefined' ? window : globalThis);
