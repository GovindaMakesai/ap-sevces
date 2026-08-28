/**
 * Lightweight in-memory GET cache + focus TTL helpers.
 * Keeps tab switches snappy (stale-while-revalidate).
 */

const store = new Map();
const inflight = new Map();

function keyOf(path, query) {
  if (!query || typeof query !== 'object') return String(path);
  const qs = Object.keys(query)
    .filter((k) => query[k] !== undefined && query[k] !== null && query[k] !== '')
    .sort()
    .map((k) => `${k}=${query[k]}`)
    .join('&');
  return qs ? `${path}?${qs}` : String(path);
}

export function cacheGet(path, query) {
  const hit = store.get(keyOf(path, query));
  if (!hit) return null;
  return hit;
}

export function cacheSet(path, query, data, ttlMs = 45000) {
  store.set(keyOf(path, query), { data, at: Date.now(), ttlMs });
  return data;
}

export function cacheFresh(path, query, ttlMs) {
  const hit = cacheGet(path, query);
  if (!hit) return false;
  const max = ttlMs != null ? ttlMs : hit.ttlMs;
  return Date.now() - hit.at < max;
}

export function cacheInvalidate(prefix) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of store.keys()) {
    if (String(k).startsWith(prefix)) store.delete(k);
  }
}

/** Deduplicate parallel identical GETs */
export async function withInflight(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve()
    .then(fn)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * useFocusEffect helper: skip network if data is fresh.
 * Returns true if caller should fetch.
 */
export function shouldRefresh(lastAtRef, ttlMs = 25000) {
  const now = Date.now();
  if (lastAtRef.current && now - lastAtRef.current < ttlMs) return false;
  return true;
}

export function markFresh(lastAtRef) {
  lastAtRef.current = Date.now();
}
