const CACHE_NAME = 'khatmas-cache-v2';
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
  // تفعيل الخدمة الجديدة فوراً دون انتظار إغلاق المتصفح
  self.skipWaiting();
});

// تنظيف التخزين المؤقت القديم عند التحديث
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('تم حذف الكاش القديم:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // السيطرة على الصفحة فوراً
  self.clients.claim();
});

// جلب الملفات من التخزين المؤقت أو الشبكة
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
