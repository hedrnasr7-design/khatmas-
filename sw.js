const CACHE_NAME = 'my-pwa-cache-v1';

// قائمة الملفات الأساسية التي تريد تخزينها للعمل دون إنترنت
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  // أضف هنا مسارات الملفات الأخرى المهمة مثل ملفات الـ CSS أو الصور إذا أردت
];

// 1. تثبيت الـ Service Worker وحفظ الملفات الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // أجبر المتصفح على تفعيل الـ Service Worker الجديد فوراً دون انتظار إغلاق المتصفح
  self.skipWaiting();
});

// 2. تفعيل الـ Service Worker وحذف الكاش القديم (إن وجد)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache); // مسح النسخ القديمة
          }
        })
      );
    })
  );
  // السيطرة على جميع الصفحات المفتوحة فوراً
  self.clients.claim();
});

// 3. استراتيجية الجلب: محاولة جلب التحديث من الشبكة أولاً، وإن لم توجد شبكة يتم جلبها من الكاش
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // إذا نجح الاتصال بالإنترنت، نقوم بتحديث النسخة المخزنة في الكاش بالنسخة الجديدة
        if (response && response.status === 200 && response.type === 'basic') {
          let responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // إذا لم يكن هناك إنترنت، يتم جلب الملف من الكاش المحلي
        return caches.match(event.request);
      })
  );
});
