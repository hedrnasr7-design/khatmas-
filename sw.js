const CACHE_NAME = 'khatmas-v2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

// تثبيت التطبيق وتخزين الملفات
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// تفعيل الكاش الجديد وحذف القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// جلب الملفات من الكاش عند انقطاع الإنترنت
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        // في حال انقطاع الإنترنت ولم يتم العثور على الملف، يمكن عرض صفحة بديلة أو إرجاع الطلب
      });
    })
  );
});
