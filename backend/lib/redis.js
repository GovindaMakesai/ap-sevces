/**
 * Redis abstraction — optional. When REDIS_URL is unset, falls back to in-memory.
 * TODO: wire ioredis when horizontal scaling is required for socket adapter + rate limits.
 */

const memoryStore = new Map();

function isEnabled() {
  return Boolean(process.env.REDIS_URL);
}

async function get(key) {
  if (!isEnabled()) return memoryStore.get(key) ?? null;
  // TODO: Redis GET
  return memoryStore.get(key) ?? null;
}

async function set(key, value, ttlSeconds) {
  if (!isEnabled()) {
    memoryStore.set(key, value);
    if (ttlSeconds) {
      setTimeout(() => memoryStore.delete(key), ttlSeconds * 1000);
    }
    return;
  }
  // TODO: Redis SETEX
  memoryStore.set(key, value);
}

async function incr(key, ttlSeconds = 60) {
  const current = (await get(key)) || 0;
  const next = Number(current) + 1;
  await set(key, next, ttlSeconds);
  return next;
}

module.exports = { isEnabled, get, set, incr };
