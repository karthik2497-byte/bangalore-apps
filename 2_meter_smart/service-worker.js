const CACHE_NAME = 'metersmart-v4';
const urlsToCache = ['./', './index.html', './privacy.html', './manifest.json', './icon-192.svg', './icon-512.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
  self.skipWaiting();
});

// All 7 apps share one origin, so caches.keys() lists every app's caches.
// Delete only this app's old versions — purging the rest wipes the others.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('metersmart-') && k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Pages 308-redirects x/index.html to x/ and x.html to x, so those precached entries are redirects, and a
// page load answered with one fails (net::ERR_FAILED): every home-screen launch did, until 2026-10-17.
const plain = r => r && r.redirected ? r.blob().then(b => new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers })) : r;

self.addEventListener('fetch', event => {
  // fares.json is network-first: a cached copy would freeze fare rates forever.
  if (event.request.url.includes('fares.json')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(plain).then(response => response || fetch(event.request)));
});
