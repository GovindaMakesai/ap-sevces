const db = require('../config/database');
const { ensureClientMetricsSchema } = require('../config/ensureClientMetricsSchema');

const ALLOWED = new Set([
  'feed_load_ms',
  'ttfv_ms',
  'reel_complete',
  'profile_open_ms',
  'upload_ok',
  'upload_fail',
  'api_error',
  'js_error',
  'feed_page',
]);

async function ingestClientMetrics(viewerId, payload = {}, reqMeta = {}) {
  await ensureClientMetricsSchema();
  const events = Array.isArray(payload.events) ? payload.events.slice(0, 25) : [];
  if (!events.length) return { accepted: 0 };

  let accepted = 0;
  for (const ev of events) {
    const name = String(ev.name || ev.event || '').slice(0, 64);
    if (!ALLOWED.has(name)) continue;
    const value = ev.value != null && Number.isFinite(Number(ev.value)) ? Number(ev.value) : null;
    let meta = ev.meta && typeof ev.meta === 'object' ? ev.meta : {};
    try {
      JSON.stringify(meta);
    } catch (_e) {
      meta = {};
    }
    try {
      await db.query(
        `INSERT INTO client_metrics (user_id, event_name, value, meta, path, user_agent)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          viewerId || null,
          name,
          value,
          JSON.stringify(meta),
          String(ev.path || reqMeta.path || '').slice(0, 300) || null,
          String(reqMeta.ua || '').slice(0, 400) || null,
        ]
      );
      accepted += 1;
    } catch (e) {
      console.warn('client_metrics insert skip:', e.message);
    }
  }
  return { accepted };
}

module.exports = { ingestClientMetrics, ALLOWED };
