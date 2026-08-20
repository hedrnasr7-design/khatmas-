const CACHE_NAME = 'khatmas-offline-v3';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.png'
];

// تثبيت التطبيق وحفظ الملفات الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// تفعيل الكاش وحذف النسخ القديمة
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

// التعامل مع الطلبات (الإنترنت أو الذاكرة المحلية)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // إرجاع النسخة المحفوظة إذا كانت موجودة
      }
      return fetch(event.request).then((response) => {
        return response;
      }).catch(() => {
        // إذا انقطع الإنترنت ولم يتوفر الاتصال، يمكن إرجاع الصفحة الرئيسية من الكاش
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
