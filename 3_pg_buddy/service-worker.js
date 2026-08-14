const CACHE_NAME = 'pgbuddy-v2';
const urlsToCache = ['./', './index.html', './manifest.json', './icon-192.svg', './icon-512.svg', './pgs.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Listings are network-first so a newly published or newly verified PG shows
  // up on the next launch. A cache-first shell would pin the seed data forever.
  // The cached copy is still the offline fallback.
  if (url.pathname.endsWith('/pgs.json')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
