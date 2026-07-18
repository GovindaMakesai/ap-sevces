const CACHE_NAME = 'ap-services-v7-sonic';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

function isHtmlPath(pathname) {
  return !pathname || pathname.endsWith('.html') || pathname === '/';
}

/** Live room HTML must stay fresh; fingerprinted JS/CSS (?v=) are immutable. */
function isNetworkFirstPath(pathname, search) {
  if (/live-room\.html|party-room\.html|app-auth\.html|login\.html/i.test(pathname || '')) {
    return true;
  }
  /* Bare JS/CSS without cache-bust query — revalidate */
  if (/\.(js|css)$/i.test(pathname || '') && !search) return true;
  return false;
}

function isImmutableAsset(pathname, search) {
  return /\.(js|css)$/i.test(pathname || '') && Boolean(search && search.length > 1);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const path = requestUrl.pathname || '';
  const search = requestUrl.search || '';
  const isHtmlNavigation =
    event.request.mode === 'navigate' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  /* Never cache API / sockets / auth */
  if (path.startsWith('/api/') || path.startsWith('/auth/') || path.startsWith('/socket.io')) {
    return;
  }

  if (isNetworkFirstPath(path, search) || isHtmlNavigation || isHtmlPath(path)) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && isHtmlPath(path)) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || caches.match('/index.html');
        })
    );
    return;
  }

  /* Fingerprinted JS/CSS (?v=…) — cache first = sonic after first load */
  if (isImmutableAsset(path, search)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || caches.match('/index.html'));
      return cachedResponse || fetchPromise;
    })
  );
});
