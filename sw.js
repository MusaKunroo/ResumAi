const CACHE_NAME = 'resumai-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './logo.png',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).catch(() => {
        // Fallback for offline if needed
      });
    })
  );
});
