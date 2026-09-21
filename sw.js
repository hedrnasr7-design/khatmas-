const CACHE_NAME = 'khatmas-shell-v4';
const DATA_CACHE = 'khatmas-data-v4';
const SHELL_ASSETS = [
  './', './index.html', './offline-store.js', './firebase-app.js',
  './firebase-auth.js', './firebase-database.js', './mafatih.js?v=23',
  './quran-data.json', './app.js?v=203'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL_ASSETS.map(async url => {
      try {
        const response = await fetch(url, { cache: 'no-cache' });
        if (response.ok) await cache.put(url, response);
      } catch (error) {
        // لا نفشل التثبيت إذا تعذر تنزيل ملف واحد بسبب ضعف الشبكة.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => ![CACHE_NAME, DATA_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && new URL(request.url).origin === self.location.origin) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (/\/khatmas-index-\d+\.json$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, CACHE_NAME).catch(() => caches.match('./index.html')));
    return;
  }
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname.endsWith('.json')) {
    event.respondWith(cacheFirst(request));
  }
});
