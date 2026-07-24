/**
 * AP Voice Soak Metrics — Phase 1 production monitoring helpers.
 * Exposes window.__apVoiceMetrics and aggregates forensic events.
 * Does not change RTC behavior.
 */
(function (global) {
  'use strict';

  const BUILD = '20260724-phase1-life';
  const MAX_LAT = 100;
  const MAX_ERR = 50;

  function blank() {
    return {
      build: BUILD,
      sessionStartedAt: Date.now(),
      seatJoinAttempts: 0,
      seatJoinOk: 0,
      seatJoinFail: 0,
      seatJoinLatencyMs: [],
      recoverCount: 0,
      recoverByReason: {},
      fullRejoinCount: 0,
      disposeByReason: {},
      joinCount: 0,
      leaveCount: 0,
      publishFailCount: 0,
      agoraErrors: [],
      cutAudioReports: 0,
    };
  }

  let m = blank();

  function reset() {
    m = blank();
    persist();
    return snapshot();
  }

  function persist() {
    try {
      global.sessionStorage?.setItem?.('ap_voice_metrics', JSON.stringify(snapshot()));
    } catch (_e) {}
  }

  function snapshot() {
    const lat = m.seatJoinLatencyMs;
    const sum = lat.reduce((a, b) => a + b, 0);
    return {
      ...m,
      seatJoinLatencyMs: lat.slice(),
      agoraErrors: m.agoraErrors.slice(),
      recoverByReason: { ...m.recoverByReason },
      disposeByReason: { ...m.disposeByReason },
      avgSeatJoinLatencyMs: lat.length ? Math.round(sum / lat.length) : null,
      p95SeatJoinLatencyMs: percentile(lat, 95),
      sessionDurationMs: Date.now() - m.sessionStartedAt,
      life: global.APAgoraLife?.getStats?.() || null,
      media: global.APLiveMedia?.getStats?.() || null,
    };
  }

  function percentile(arr, p) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const i = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
    return s[Math.max(0, i)];
  }

  function noteSeatJoinStart() {
    m._seatT0 = Date.now();
    m.seatJoinAttempts += 1;
    persist();
  }

  function noteSeatJoinOk() {
    if (m._seatT0) {
      const ms = Date.now() - m._seatT0;
      m.seatJoinLatencyMs.push(ms);
      if (m.seatJoinLatencyMs.length > MAX_LAT) m.seatJoinLatencyMs.shift();
      m._seatT0 = 0;
    }
    m.seatJoinOk += 1;
    persist();
  }

  function noteSeatJoinFail(err) {
    m.seatJoinFail += 1;
    m._seatT0 = 0;
    noteAgoraError(err, 'seat_join_fail');
    persist();
  }

  function noteRecover(reason) {
    m.recoverCount += 1;
    const key = String(reason || 'unknown');
    m.recoverByReason[key] = (m.recoverByReason[key] || 0) + 1;
    persist();
  }

  function noteDispose(reason) {
    const key = String(reason || 'dispose');
    m.disposeByReason[key] = (m.disposeByReason[key] || 0) + 1;
    if (/rejoin|unrecoverable|peerconnection|startAgora_rejoin|early_rejoin|guest_publish/i.test(key)) {
      m.fullRejoinCount += 1;
    }
    persist();
  }

  function noteJoin() {
    m.joinCount += 1;
    persist();
  }

  function noteLeave() {
    m.leaveCount += 1;
    persist();
  }

  function notePublishFail(err) {
    m.publishFailCount += 1;
    noteAgoraError(err, 'publish_fail');
    persist();
  }

  function noteAgoraError(err, source) {
    const msg = String(err?.message || err || source || 'error').slice(0, 240);
    m.agoraErrors.push({ t: Date.now(), source: source || 'agora', msg });
    if (m.agoraErrors.length > MAX_ERR) m.agoraErrors.shift();
    persist();
  }

  function noteCutAudioReport() {
    m.cutAudioReports += 1;
    persist();
  }

  /** Ingest forensic event names emitted by social-live. */
  function onForensic(name, detail) {
    const n = String(name || '');
    if (n === 'AGORA_JOIN_SUCCESS' || n === 'AGORA_EARLY_JOIN_SUCCESS') noteJoin();
    if (n === 'PUBLISH_FAILED') notePublishFail(detail?.msg || detail?.reason);
    if (n === 'AGORA_JOIN_FAILED' || n === 'AGORA_EARLY_JOIN_FAILED') {
      noteAgoraError(detail?.msg || n, n);
    }
    if (/media recover/i.test(n) || n === 'MEDIA_RECOVER') noteRecover(detail?.reason || n);
  }

  global.APVoiceMetrics = {
    BUILD,
    reset,
    snapshot,
    noteSeatJoinStart,
    noteSeatJoinOk,
    noteSeatJoinFail,
    noteRecover,
    noteDispose,
    noteJoin,
    noteLeave,
    notePublishFail,
    noteAgoraError,
    noteCutAudioReport,
    onForensic,
  };

  try {
    global.console?.info?.('[APVoiceMetrics] ready', BUILD);
  } catch (_e) {}
})(typeof window !== 'undefined' ? window : globalThis);
