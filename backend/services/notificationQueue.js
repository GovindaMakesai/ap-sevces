/**
 * In-process notification queue: batching, retries, dedupe.
 * No Redis/Bull required — works on single or multi-instance (dedupe is best-effort per process).
 */

const BATCH_SIZE = 80;
const MAX_ATTEMPTS = 3;
const BASE_RETRY_MS = 1500;
const DEDUPE_TTL_MS = 5 * 60 * 1000;

const queue = [];
const dedupe = new Map(); /* key -> expiresAt */
let pumping = false;
let sendHandler = null;

function setSendHandler(fn) {
  sendHandler = fn;
}

function pruneDedupe(now = Date.now()) {
  for (const [k, exp] of dedupe.entries()) {
    if (exp <= now) dedupe.delete(k);
  }
}

function isDuplicate(dedupeKey) {
  if (!dedupeKey) return false;
  pruneDedupe();
  const exp = dedupe.get(String(dedupeKey));
  return Boolean(exp && exp > Date.now());
}

function markDedupe(dedupeKey, ttlMs = DEDUPE_TTL_MS) {
  if (!dedupeKey) return;
  dedupe.set(String(dedupeKey), Date.now() + ttlMs);
}

/**
 * Enqueue a push job.
 * @param {{ userId: string, title: string, body: string, data?: object, type?: string, dedupeKey?: string, preferenceKey?: string }} job
 */
function enqueue(job) {
  if (!job?.userId || !job?.title) return false;
  if (isDuplicate(job.dedupeKey)) return false;
  if (job.dedupeKey) markDedupe(job.dedupeKey);
  queue.push({
    ...job,
    attempts: 0,
    enqueuedAt: Date.now(),
  });
  setImmediate(pump);
  return true;
}

/**
 * Enqueue the same payload to many users (batched internally).
 */
function enqueueMany(userIds, payload) {
  const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
  let n = 0;
  for (const userId of ids) {
    const dedupeKey = payload.dedupeKey ? `${payload.dedupeKey}:${userId}` : undefined;
    if (
      enqueue({
        ...payload,
        userId,
        dedupeKey,
      })
    ) {
      n += 1;
    }
  }
  return n;
}

async function processOne(job) {
  if (typeof sendHandler !== 'function') {
    console.warn('[NotificationQueue] no send handler registered');
    return { ok: false, skip: true };
  }
  try {
    const result = await sendHandler(job);
    return { ok: true, result };
  } catch (err) {
    job.attempts += 1;
    const msg = err?.message || String(err);
    console.warn('[NotificationQueue] send failed', {
      userId: job.userId,
      type: job.type,
      attempts: job.attempts,
      error: msg,
    });
    if (job.attempts < MAX_ATTEMPTS) {
      const delay = BASE_RETRY_MS * Math.pow(2, job.attempts - 1);
      await new Promise((r) => setTimeout(r, delay));
      queue.push(job);
      return { ok: false, retry: true };
    }
    return { ok: false, failed: true, error: msg };
  }
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const batch = queue.splice(0, BATCH_SIZE);
      for (const job of batch) {
        await processOne(job);
      }
      if (queue.length) {
        await new Promise((r) => setTimeout(r, 40));
      }
    }
  } finally {
    pumping = false;
    if (queue.length) setImmediate(pump);
  }
}

function stats() {
  pruneDedupe();
  return {
    pending: queue.length,
    dedupeKeys: dedupe.size,
    pumping,
  };
}

module.exports = {
  setSendHandler,
  enqueue,
  enqueueMany,
  pump,
  stats,
  isDuplicate,
  markDedupe,
  BATCH_SIZE,
  MAX_ATTEMPTS,
};
