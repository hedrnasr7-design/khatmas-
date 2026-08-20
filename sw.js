const CACHE_NAME = 'khatmas-cache-v1';
const assetsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// تثبيت الخدمة وتخزين الملفات
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
});

// جلب الملفات من التخزين المؤقت عند انقطاع الإنترنت
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
