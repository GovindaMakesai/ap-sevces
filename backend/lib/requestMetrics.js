/**
 * In-process request metrics for slow-endpoint identification.
 * Safe for multi-instance: each node tracks its own traffic.
 */

const SLOW_MS = Number(process.env.SLOW_REQUEST_MS) || 1500;
const MAX_ROUTES = 200;

const totals = {
  startedAt: Date.now(),
  requests: 0,
  errors: 0,
  timeouts: 0,
  slow: 0,
};

const byRoute = new Map();

function routeKey(method, path) {
  const p = String(path || '')
    .split('?')[0]
    .replace(/\/[0-9a-f-]{36}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .slice(0, 120);
  return `${method} ${p}`;
}

function record(method, path, status, ms) {
  totals.requests += 1;
  if (status >= 500) totals.errors += 1;
  if (ms >= SLOW_MS) totals.slow += 1;

  const key = routeKey(method, path);
  let rec = byRoute.get(key);
  if (!rec) {
    if (byRoute.size >= MAX_ROUTES) return;
    rec = { count: 0, errors: 0, slow: 0, totalMs: 0, maxMs: 0 };
    byRoute.set(key, rec);
  }
  rec.count += 1;
  rec.totalMs += ms;
  if (status >= 500) rec.errors += 1;
  if (ms >= SLOW_MS) rec.slow += 1;
  if (ms > rec.maxMs) rec.maxMs = ms;
}

function snapshot() {
  const routes = [...byRoute.entries()]
    .map(([route, r]) => ({
      route,
      count: r.count,
      errors: r.errors,
      slow: r.slow,
      avgMs: r.count ? Math.round(r.totalMs / r.count) : 0,
      maxMs: r.maxMs,
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 40);

  return {
    uptimeSec: Math.round((Date.now() - totals.startedAt) / 1000),
    requests: totals.requests,
    errors: totals.errors,
    slow: totals.slow,
    slowThresholdMs: SLOW_MS,
    routes,
  };
}

module.exports = { record, snapshot, SLOW_MS };
