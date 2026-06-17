const CACHE_NAME = 'ap-services-v6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

/** Always fetch fresh — live/party UI changes often. */
function isNetworkFirstPath(pathname) {
  if (!pathname) return false;
  if (/live-room|party-room|social-live|social-shell|social-theme|auth-guard|app\.js/i.test(pathname)) {
    return true;
  }
  return /\.(js|css|html)$/i.test(pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.filter((cacheName) => cacheName !== CACHE_NAME).map((cacheName) => caches.delete(cacheName))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  if (!isSameOrigin) return;

  const path = requestUrl.pathname || '';
  const isHtmlNavigation =
    event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html');

  if (isNetworkFirstPath(path) || isHtmlNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && !isNetworkFirstPath(path)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return caches.match('/index.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          return networkResponse;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
