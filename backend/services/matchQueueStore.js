/**
 * Redis-backed Voice/Video Match queue — shared across backend instances.
 * Falls back to in-memory only when REDIS_URL is unset (local dev).
 */
const redis = require('../lib/redis');

const SEARCH_TTL_MS = 90_000;
const SEARCH_TTL_SEC = Math.ceil(SEARCH_TTL_MS / 1000);
const USER_META_TTL_SEC = SEARCH_TTL_SEC + 60;

const MODES = ['voice', 'video'];

/** @type {{ voice: Array<object>, video: Array<object> }} */
const memQueues = { voice: [], video: [] };
const memByUser = new Map();

let warnedNoRedis = false;

function queueKey(mode) {
  return `match:queue:${mode === 'video' ? 'video' : 'voice'}`;
}

function userKey(userId) {
  return `match:queue:user:${String(userId)}`;
}

function normalizeMode(mode) {
  return mode === 'video' ? 'video' : 'voice';
}

function warnNoRedis() {
  if (warnedNoRedis) return;
  warnedNoRedis = true;
  if (process.env.NODE_ENV === 'production') {
    console.warn('[matchQueue] REDIS_URL not set — queue is in-memory (single-instance only)');
  }
}

function memRemove(userId) {
  const uid = String(userId);
  const rec = memByUser.get(uid);
  if (!rec) return false;
  const list = memQueues[rec.mode] || [];
  const idx = list.findIndex((x) => String(x.userId) === uid);
  if (idx >= 0) list.splice(idx, 1);
  memByUser.delete(uid);
  return true;
}

function memEnqueue(userId, mode, clientRequestId) {
  const uid = String(userId);
  mode = normalizeMode(mode);
  const existing = memByUser.get(uid);
  if (existing && existing.mode === mode) return existing;
  if (existing) memRemove(uid);
  const rec = { userId: uid, mode, at: Date.now(), clientRequestId: clientRequestId || null };
  memQueues[mode].push(rec);
  memByUser.set(uid, rec);
  return rec;
}

function memIsQueued(userId) {
  return memByUser.has(String(userId));
}

function memGetQueued(userId) {
  return memByUser.get(String(userId)) || null;
}

function memPopOldest(mode, excludeUserId) {
  const list = memQueues[normalizeMode(mode)];
  const now = Date.now();
  let safety = 0;
  while (list.length && safety++ < 40) {
    const cand = list.shift();
    memByUser.delete(String(cand.userId));
    if (now - cand.at > SEARCH_TTL_MS) continue;
    if (String(cand.userId) === String(excludeUserId)) continue;
    return cand;
  }
  return null;
}

function memSweepExpired(onExpired) {
  const now = Date.now();
  for (const mode of MODES) {
    const kept = [];
    for (const rec of memQueues[mode]) {
      if (now - rec.at > SEARCH_TTL_MS) {
        memByUser.delete(String(rec.userId));
        onExpired?.(rec.userId, 'no_match');
        continue;
      }
      kept.push(rec);
    }
    memQueues[mode] = kept;
  }
}

function memListMode(mode) {
  return [...(memQueues[normalizeMode(mode)] || [])];
}

async function enqueue(userId, mode, clientRequestId) {
  const uid = String(userId);
  mode = normalizeMode(mode);
  const at = Date.now();
  const c = await redis.getClient();

  if (c) {
    const uk = userKey(uid);
    const existing = await c.hgetall(uk);
    if (existing?.mode === mode) {
      return {
        userId: uid,
        mode,
        at: Number(existing.at) || at,
        clientRequestId: existing.clientRequestId || clientRequestId || null,
      };
    }
    if (existing?.mode) await remove(uid);

    const pipe = c.pipeline();
    pipe.zadd(queueKey(mode), at, uid);
    pipe.hset(uk, {
      mode,
      at: String(at),
      clientRequestId: clientRequestId || '',
    });
    pipe.expire(uk, USER_META_TTL_SEC);
    await pipe.exec();
    return { userId: uid, mode, at, clientRequestId: clientRequestId || null };
  }

  warnNoRedis();
  return memEnqueue(uid, mode, clientRequestId);
}

async function remove(userId) {
  const uid = String(userId);
  const c = await redis.getClient();

  if (c) {
    const uk = userKey(uid);
    const existing = await c.hgetall(uk);
    if (!existing?.mode) return false;
    const pipe = c.pipeline();
    pipe.zrem(queueKey(existing.mode), uid);
    pipe.del(uk);
    await pipe.exec();
    return true;
  }

  return memRemove(uid);
}

async function isQueued(userId) {
  const uid = String(userId);
  const c = await redis.getClient();
  if (c) {
    const exists = await c.exists(userKey(uid));
    return exists === 1;
  }
  return memIsQueued(uid);
}

async function getQueued(userId) {
  const uid = String(userId);
  const c = await redis.getClient();
  if (c) {
    const meta = await c.hgetall(userKey(uid));
    if (!meta?.mode) return null;
    return {
      userId: uid,
      mode: meta.mode,
      at: Number(meta.at) || Date.now(),
      clientRequestId: meta.clientRequestId || null,
    };
  }
  return memGetQueued(uid);
}

async function popOldest(mode, excludeUserId) {
  mode = normalizeMode(mode);
  const c = await redis.getClient();
  const now = Date.now();
  const minScore = now - SEARCH_TTL_MS;

  if (c) {
    await c.zremrangebyscore(queueKey(mode), '-inf', minScore - 1);
    let safety = 0;
    while (safety++ < 40) {
      const popped = await c.zpopmin(queueKey(mode), 1);
      if (!popped || !popped.length) return null;
      const uid = String(popped[0]);
      const score = Number(popped[1]);
      const meta = await c.hgetall(userKey(uid)).catch(() => ({}));
      await c.del(userKey(uid));
      if (score < minScore) continue;
      if (uid === String(excludeUserId)) continue;
      return {
        userId: uid,
        mode,
        at: score,
        clientRequestId: meta?.clientRequestId || null,
      };
    }
    return null;
  }

  warnNoRedis();
  return memPopOldest(mode, excludeUserId);
}

async function listMode(mode) {
  mode = normalizeMode(mode);
  const c = await redis.getClient();
  if (c) {
    const now = Date.now();
    const minScore = now - SEARCH_TTL_MS;
    await c.zremrangebyscore(queueKey(mode), '-inf', minScore - 1);
    const ids = await c.zrange(queueKey(mode), 0, -1);
    const out = [];
    for (const uid of ids) {
      const meta = await c.hgetall(userKey(uid));
      if (!meta?.mode) {
        await c.zrem(queueKey(mode), uid);
        continue;
      }
      out.push({
        userId: String(uid),
        mode: meta.mode,
        at: Number(meta.at) || now,
        clientRequestId: meta.clientRequestId || null,
      });
    }
    return out;
  }
  return memListMode(mode);
}

async function sweepExpired(onExpired) {
  const c = await redis.getClient();
  const now = Date.now();
  const minScore = now - SEARCH_TTL_MS;

  if (c) {
    for (const mode of MODES) {
      const expired = await c.zrangebyscore(queueKey(mode), '-inf', minScore - 1);
      if (expired.length) {
        const pipe = c.pipeline();
        for (const uid of expired) {
          pipe.zrem(queueKey(mode), uid);
          pipe.del(userKey(uid));
          onExpired?.(String(uid), 'no_match');
        }
        await pipe.exec();
      }
    }
    return;
  }

  memSweepExpired(onExpired);
}

module.exports = {
  SEARCH_TTL_MS,
  enqueue,
  remove,
  isQueued,
  getQueued,
  popOldest,
  listMode,
  sweepExpired,
};
