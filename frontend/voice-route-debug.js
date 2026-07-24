/**
 * TEMPORARY voice route debug — Phase 1 soak investigation.
 * DEFAULT: inactive (no behavior change).
 *
 * Enable on device:
 *   localStorage.setItem('ap_voice_route_debug','1'); location.reload();
 * Or open live with: ?voiceRouteDebug=1
 *
 * Dump:
 *   copy(JSON.stringify(window.__apVoiceRouteDebug, null, 2))
 *
 * Disable:
 *   localStorage.removeItem('ap_voice_route_debug'); location.reload();
 *
 * REMOVE after investigation — not a permanent feature.
 */
(function (global) {
  'use strict';

  function enabled() {
    try {
      if (global.localStorage?.getItem?.('ap_voice_route_debug') === '1') return true;
      if (/voiceRouteDebug=1/i.test(String(global.location?.search || ''))) return true;
    } catch (_e) {}
    return false;
  }

  if (!enabled()) {
    global.APVoiceRouteDebug = { active: false, enableHint: 'localStorage.ap_voice_route_debug=1' };
    return;
  }

  const log = [];
  const MAX = 400;
  function push(type, data) {
    const entry = { t: Date.now(), iso: new Date().toISOString(), type, ...(data || {}) };
    log.push(entry);
    if (log.length > MAX) log.shift();
    try {
      console.log('[TEMP-VOICE-ROUTE]', type, data || '');
    } catch (_e) {}
    try {
      global.ReactNativeWebView?.postMessage?.(
        JSON.stringify({ type: 'temp_voice_route_debug', entry })
      );
    } catch (_e2) {}
  }

  function sinkInfo(el) {
    if (!el) return null;
    return {
      id: el.id || null,
      paused: el.paused,
      muted: el.muted,
      volume: el.volume,
      sinkId: el.sinkId == null || el.sinkId === '' ? '(default)' : String(el.sinkId),
      readyState: el.readyState,
      currentTime: el.currentTime,
    };
  }

  async function listOutputs() {
    try {
      const devices = (await navigator.mediaDevices?.enumerateDevices?.()) || [];
      return devices
        .filter((d) => d.kind === 'audiooutput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || '(empty-label)',
          groupId: d.groupId,
        }));
    } catch (e) {
      return [{ error: String(e?.message || e) }];
    }
  }

  let __lastClient = null;

  function pcmProbe() {
    try {
      const eng = global.APLiveMedia;
      const client = __lastClient;
      const remotes = [];
      const users = client?.remoteUsers || [];
      users.forEach((u) => {
        const t = u.audioTrack;
        let lvl = null;
        try {
          lvl = typeof t?.getVolumeLevel === 'function' ? Number(t.getVolumeLevel()) : null;
        } catch (_e) {}
        remotes.push({
          uid: u.uid,
          hasAudio: u.hasAudio,
          isPlaying: t?.isPlaying,
          volLevel: lvl,
          trackState: t?.getMediaStreamTrack?.()?.readyState || null,
        });
      });
      return {
        remotes,
        mediaStats: eng?.getStats?.() || null,
        sinkDomCount: document.querySelectorAll('audio.ap-remote-audio-sink').length,
      };
    } catch (e) {
      return { error: String(e?.message || e) };
    }
  }

  function wrapLiveMedia() {
    const eng = global.APLiveMedia;
    if (!eng || eng.__apRouteDbgWrapped) return;
    const origPlay = eng.playRemoteAudio?.bind(eng);
    const origRemove = eng.removeSink?.bind(eng);
    if (origPlay) {
      eng.playRemoteAudio = async function (user, opts) {
        let lvl = null;
        try {
          lvl = user?.audioTrack?.getVolumeLevel?.();
        } catch (_e) {}
        push('remote_track_play', {
          uid: user?.uid,
          force: Boolean(opts?.force),
          isPlaying: user?.audioTrack?.isPlaying,
          volLevel: lvl,
          trackState: user?.audioTrack?.getMediaStreamTrack?.()?.readyState,
        });
        const ok = await origPlay(user, opts);
        push('remote_track_play_result', { uid: user?.uid, ok });
        return ok;
      };
    }
    if (origRemove) {
      eng.removeSink = function (uid) {
        push('remote_track_stop_or_sink_remove', { uid });
        return origRemove(uid);
      };
    }
    eng.__apRouteDbgWrapped = true;
    push('live_media_wrapped', { build: eng.BUILD });
  }

  /* Capture Agora client from createClient for PCM probe */
  function wrapAgoraFactory() {
    const A = global.AgoraRTC;
    if (!A || A.__apRouteDbgWrapped) return;
    const orig = A.createClient?.bind(A);
    if (!orig) return;
    A.createClient = function () {
      const client = orig.apply(A, arguments);
      __lastClient = client;
      push('agora_createClient', { mode: arguments[0]?.mode });
      try {
        client.on?.('user-published', (user, mediaType) => {
          if (mediaType === 'audio') {
            push('agora_user_published_audio', { uid: user?.uid });
          }
        });
      } catch (_e) {}
      return client;
    };
    A.__apRouteDbgWrapped = true;
    push('agora_factory_wrapped');
  }

  setInterval(() => {
    wrapLiveMedia();
    wrapAgoraFactory();
  }, 1000);

  function snapshot() {
    const ctx = global.__apLiveAudioCtx;
    const sinks = [...document.querySelectorAll('audio.ap-remote-audio-sink, audio[data-ap-remote-audio]')].map(
      sinkInfo
    );
    return {
      active: true,
      ua: navigator.userAgent,
      audioCtx: ctx ? ctx.state : null,
      sinkCount: sinks.length,
      sinks,
      pcm: pcmProbe(),
      logTail: log.slice(-40),
    };
  }

  /* Patch HTMLMediaElement.setSinkId */
  try {
    const proto = global.HTMLMediaElement?.prototype;
    if (proto?.setSinkId && !proto.__apRouteDebugPatched) {
      const orig = proto.setSinkId;
      proto.setSinkId = async function (id) {
        push('setSinkId', { id, before: this.sinkId || '(default)', el: this.id || this.className });
        try {
          const r = await orig.call(this, id);
          push('setSinkId_ok', { id, after: this.sinkId || '(default)' });
          return r;
        } catch (e) {
          push('setSinkId_fail', { id, err: String(e?.message || e) });
          throw e;
        }
      };
      proto.__apRouteDebugPatched = true;
    }
  } catch (_e) {}

  /* Patch HTMLMediaElement.play */
  try {
    const proto = global.HTMLMediaElement?.prototype;
    if (proto?.play && !proto.__apPlayDebugPatched) {
      const origPlay = proto.play;
      proto.play = function () {
        if (this.classList?.contains?.('ap-remote-audio-sink') || this.dataset?.apRemoteAudio) {
          push('html_audio_play', sinkInfo(this));
        }
        return origPlay.apply(this, arguments);
      };
      proto.__apPlayDebugPatched = true;
    }
  } catch (_e2) {}

  /* Observe sink create/destroy */
  try {
    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes?.forEach?.((n) => {
          if (n.nodeType === 1 && n.matches?.('audio.ap-remote-audio-sink, audio[data-ap-remote-audio]')) {
            push('html_audio_created', sinkInfo(n));
          }
        });
        m.removedNodes?.forEach?.((n) => {
          if (n.nodeType === 1 && (n.classList?.contains?.('ap-remote-audio-sink') || n.dataset?.apRemoteAudio)) {
            push('html_audio_destroyed', { id: n.id });
          }
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_e3) {}

  /* devicechange — BT connect/disconnect */
  try {
    navigator.mediaDevices?.addEventListener?.('devicechange', async () => {
      const outs = await listOutputs();
      const bt = outs.filter((d) => /bluetooth|bt |airpods|buds|headset|headphone/i.test(d.label || ''));
      push('devicechange', {
        outputs: outs,
        bluetoothLabels: bt,
        currentSinks: [...document.querySelectorAll('audio.ap-remote-audio-sink')].map((el) => ({
          id: el.id,
          sinkId: el.sinkId || '(default)',
        })),
      });
    });
  } catch (_e4) {}

  /* Periodic PCM vs audible probe — distinguishes routing vs subscribe failure */
  setInterval(() => {
    wrapLiveMedia();
    wrapAgoraFactory();
    const pcm = pcmProbe();
    const sinks = [...document.querySelectorAll('audio.ap-remote-audio-sink')].map(sinkInfo);
    const remotes = pcm.remotes || [];
    const anyPcm = remotes.some(
      (p) => (typeof p.volLevel === 'number' && p.volLevel > 0.001) || p.isPlaying === true
    );
    const anyAudibleDom = sinks.some((s) => s && !s.paused && !s.muted && s.volume > 0);
    push('pcm_vs_output', {
      verdict:
        anyPcm && !anyAudibleDom
          ? 'ROUTING_OR_SINK'
          : !anyPcm
            ? 'NO_PCM_OR_NOT_PLAYING'
            : 'PCM_AND_DOM_OK',
      anyPcm,
      anyAudibleDom,
      pcm,
      sinks,
      audioCtx: global.__apLiveAudioCtx?.state || null,
    });
  }, 8000);

  /* Visibility / focus-ish */
  document.addEventListener('visibilitychange', () => {
    push('visibility', { state: document.visibilityState, audioCtx: global.__apLiveAudioCtx?.state });
  });

  global.APVoiceRouteDebug = {
    active: true,
    log,
    snapshot,
    listOutputs,
    pcmProbe,
    dump: () => JSON.stringify(snapshot(), null, 2),
  };

  listOutputs().then((outs) =>
    push('boot', {
      outs,
      ua: navigator.userAgent,
      setSinkIdSupported: typeof HTMLMediaElement !== 'undefined' && typeof HTMLMediaElement.prototype.setSinkId === 'function',
      selectAudioOutputSupported: typeof navigator.mediaDevices?.selectAudioOutput === 'function',
      isAndroid: /Android/i.test(navigator.userAgent || ''),
      isWebView: /; wv\)/i.test(navigator.userAgent || '') || Boolean(global.ReactNativeWebView),
    })
  );
  push('enabled', { build: 'temp-voice-route-debug' });
})(typeof window !== 'undefined' ? window : globalThis);
