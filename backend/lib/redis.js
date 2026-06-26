/**
 * Redis abstraction — uses ioredis when REDIS_URL is set, else in-memory fallback.
 * TODO: Wire @socket.io/redis-adapter in server.js for multi-instance sockets.
 */

const memoryStore = new Map();
const memoryTtl = new Map();

let client = null;
let connectPromise = null;

function isEnabled() {
  return Boolean(process.env.REDIS_URL);
}

async function getClient() {
  if (!isEnabled()) return null;
  if (client) return client;
  if (!connectPromise) {
    connectPromise = (async () => {
      try {
        const Redis = require('ioredis');
        client = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          connectTimeout: 2500,
          commandTimeout: 2500,
          enableOfflineQueue: false,
        });
        client.on('error', (err) => console.error('[redis]', err.message));
        await client.connect();
        return client;
      } catch (err) {
        console.warn('[redis] connect failed, using memory fallback:', err.message);
        client = null;
        connectPromise = null;
        return null;
      }
    })();
  }
  return connectPromise;
}

async function get(key) {
  const c = await getClient();
  if (c) {
    try {
      const val = await c.get(key);
      return val ?? null;
    } catch (err) {
      console.warn('[redis] get failed:', err.message);
      return null;
    }
  }
  if (memoryTtl.has(key) && memoryTtl.get(key) < Date.now()) {
    memoryStore.delete(key);
    memoryTtl.delete(key);
    return null;
  }
  return memoryStore.get(key) ?? null;
}

async function set(key, value, ttlSeconds) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const c = await getClient();
  if (c) {
    try {
      if (ttlSeconds) await c.setex(key, ttlSeconds, str);
      else await c.set(key, str);
      return;
    } catch (err) {
      console.warn('[redis] set failed:', err.message);
      return;
    }
  }
  memoryStore.set(key, str);
  if (ttlSeconds) memoryTtl.set(key, Date.now() + ttlSeconds * 1000);
}

async function del(key) {
  const c = await getClient();
  if (c) await c.del(key);
  memoryStore.delete(key);
  memoryTtl.delete(key);
}

async function incr(key, ttlSeconds = 60) {
  const c = await getClient();
  if (c) {
    const n = await c.incr(key);
    if (ttlSeconds && n === 1) await c.expire(key, ttlSeconds);
    return n;
  }
  const current = Number((await get(key)) || 0) + 1;
  await set(key, current, ttlSeconds);
  return current;
}

async function disconnect() {
  if (client) {
    await client.quit();
    client = null;
    connectPromise = null;
  }
}

module.exports = { isEnabled, get, set, del, incr, disconnect, getClient };
