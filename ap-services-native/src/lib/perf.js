/**
 * Shared performance helpers — debounce, caches, media prefetch.
 */

/** Debounce — delays fn until pause in calls. */
export function debounce(fn, waitMs = 300) {
  let timer = null;
  const debounced = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  debounced.flush = (...args) => {
    if (timer) clearTimeout(timer);
    timer = null;
    fn(...args);
  };
  return debounced;
}

/** Throttle — at most once per window. */
export function throttle(fn, waitMs = 200) {
  let last = 0;
  let pending = null;
  return (...args) => {
    const now = Date.now();
    const remaining = waitMs - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
      return;
    }
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      last = Date.now();
      pending = null;
      fn(...args);
    }, remaining);
  };
}

/** In-memory list cache for stale-while-revalidate screens. */
const listStores = new Map();

export function listCacheGet(key, maxAgeMs = 60000) {
  const hit = listStores.get(String(key));
  if (!hit) return null;
  if (Date.now() - hit.at > maxAgeMs) return null;
  return hit.data;
}

export function listCacheSet(key, data) {
  listStores.set(String(key), { data, at: Date.now() });
}

/** Profile panel snapshot for instant profile open. */
const profileStores = new Map();

export function profileCacheGet(userId) {
  return profileStores.get(String(userId)) || null;
}

export function profileCacheSet(userId, snapshot) {
  if (!userId || !snapshot) return;
  profileStores.set(String(userId), { ...snapshot, at: Date.now() });
}

/** Prefetch image URI into disk/memory cache (expo-image or RN Image). */
export function prefetchImage(uri) {
  const u = String(uri || '').trim();
  if (!u) return Promise.resolve();
  try {
    const ExpoImage = require('expo-image').Image;
    if (ExpoImage?.prefetch) return ExpoImage.prefetch(u).catch(() => {});
  } catch (_e) {}
  try {
    const { Image } = require('react-native');
    return Image.prefetch(u).catch(() => {});
  } catch (_e2) {}
  return Promise.resolve();
}

/** Warm the next reel thumbnails (and poster frames). */
export function prefetchReelPosts(posts, centerIndex, radius = 2) {
  if (!Array.isArray(posts) || !posts.length) return;
  const start = Math.max(0, centerIndex - radius);
  const end = Math.min(posts.length - 1, centerIndex + radius);
  for (let i = start; i <= end; i += 1) {
    const p = posts[i];
    if (!p) continue;
    prefetchImage(p.thumb || p.mediaUrl);
  }
}
