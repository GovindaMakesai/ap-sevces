/**
 * Lightweight creator telemetry — batched, best-effort, no UI impact.
 */
(function () {
  const QUEUE_KEY = 'ap_creator_metrics_q';
  const FLUSH_MS = 12000;
  const MAX_QUEUE = 40;
  let timer = null;
  let flushing = false;

  function readQueue() {
    try {
      return JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]');
    } catch (_e) {
      return [];
    }
  }

  function writeQueue(q) {
    try {
      sessionStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
    } catch (_e) { /* ignore */ }
  }

  function track(name, value, meta) {
    if (!name) return;
    const q = readQueue();
    q.push({
      name: String(name).slice(0, 64),
      value: value != null ? Number(value) : null,
      meta: meta && typeof meta === 'object' ? meta : {},
      path: location.pathname + location.search,
      t: Date.now(),
    });
    writeQueue(q);
    scheduleFlush();
  }

  function mark(name) {
    const t0 = performance.now();
    return {
      end(meta) {
        track(name, Math.round(performance.now() - t0), meta);
      },
    };
  }

  function scheduleFlush() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_MS);
  }

  async function flush() {
    if (flushing) return;
    const q = readQueue();
    if (!q.length || !window.API?.post) return;
    flushing = true;
    writeQueue([]);
    try {
      await API.post('/social/client-metrics', { events: q });
    } catch (_e) {
      /* re-queue a few */
      const again = readQueue().concat(q.slice(0, 10));
      writeQueue(again);
    } finally {
      flushing = false;
    }
  }

  function bindGlobalErrors() {
    if (window.__apMetricsBound) return;
    window.__apMetricsBound = true;
    window.addEventListener('error', (e) => {
      if (Math.random() > 0.35) return;
      track('js_error', 1, {
        message: String(e.message || 'error').slice(0, 160),
        source: String(e.filename || '').slice(0, 120),
      });
    });
    window.addEventListener('unhandledrejection', (e) => {
      if (Math.random() > 0.35) return;
      const msg = e.reason?.message || String(e.reason || 'rejection');
      track('js_error', 1, { message: String(msg).slice(0, 160), kind: 'rejection' });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', () => flush());
  }

  bindGlobalErrors();

  window.SocialCreatorTelemetry = { track, mark, flush };
})();
