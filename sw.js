const CACHE_NAME = 'khatmas-app-shell-v3';

const APP_SHELL = [
    './',
    './index.html',
    './app.js',
    './offline-store.js',
    './manifest.json',
    './firebase-app.js',
    './firebase-auth.js',
    './firebase-database.js',
    './amiri-bold.ttf',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-512.png',
    './apple-touch-icon.png',
    './favicon-96.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);

    try {
        const response = await fetch(request, {
            cache: 'no-store'
        });

        if (response && response.ok) {
            await cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        const cachedResponse = await cache.match(request, {
            ignoreSearch: true
        });

        if (cachedResponse) {
            return cachedResponse;
        }

        if (request.mode === 'navigate') {
            const cachedIndex = await cache.match('./index.html');
            if (cachedIndex) return cachedIndex;
        }

        throw error;
    }
}

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // لا نتدخل في طلبات Firebase أو Google Generative Language.
    if (
        url.hostname.endsWith('firebaseio.com') ||
        url.hostname === 'generativelanguage.googleapis.com'
    ) {
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request));
    }
});
