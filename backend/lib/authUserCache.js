/**
 * Short-lived auth user cache — avoids a Postgres round-trip on every authenticated request.
 * Invalidated automatically by TTL; sensitive state (deactivated) still checked on cache miss.
 */

const TTL_MS = Number(process.env.AUTH_USER_CACHE_TTL_MS) || 45_000;
const MAX_ENTRIES = Number(process.env.AUTH_USER_CACHE_MAX) || 5000;

const cache = new Map();

function prune() {
  if (cache.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
    if (cache.size <= MAX_ENTRIES * 0.8) break;
  }
  while (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
    else break;
  }
}

function get(userId) {
  const rec = cache.get(String(userId));
  if (!rec) return null;
  if (rec.expiresAt <= Date.now()) {
    cache.delete(String(userId));
    return null;
  }
  return rec.user;
}

function set(userId, user) {
  cache.set(String(userId), { user, expiresAt: Date.now() + TTL_MS });
  prune();
}

function invalidate(userId) {
  if (userId) cache.delete(String(userId));
}

function clear() {
  cache.clear();
}

module.exports = { get, set, invalidate, clear, TTL_MS };
