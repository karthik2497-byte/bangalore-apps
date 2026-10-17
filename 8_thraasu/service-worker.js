const CACHE_NAME = 'thraasu-v13';
const urlsToCache = ['./', './index.html', './bill-core.js', './products.json', './manifest.json', './icon-192.svg', './icon-512.svg'];
const FONTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

// cache: 'reload' skips the browser's HTTP cache: Cloudflare serves .js with max-age=14400, so a plain
// addAll paired a new index.html with a 4-hour-old bill-core.js (v9: "sameName is not defined").
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

// All tinkerhouse apps share one origin, so caches.keys() lists every app's caches.
// Delete only this app's old versions — purging the rest wipes the others.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('thraasu-') && k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Pages 308-redirects x/index.html to x/ and x.html to x, so those precached entries are redirects, and a
// page load answered with one fails (net::ERR_FAILED): every home-screen launch did, until 2026-10-17.
const plain = r => r && r.redirected ? r.blob().then(b => new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers })) : r;

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;   // shop sync: always the network, never a cache

  // Prices are network-first so a price change reaches the counter on the next
  // launch; the cached copy keeps billing working when the shop is offline.
  if (url.origin === self.location.origin && url.pathname.endsWith('/products.json')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(event.request, copy)); }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Font CSS and files are versioned by URL: cache on first use so Malayalam and the
  // emoji subset still render offline. The <link>s are crossorigin, so these are not opaque.
  // ponytail: photos cache on first view, not at install (2.3 MB); a category never opened
  // online shows its emoji offline. Precache img/ if shops need every photo from day one.
  // A replaced photo needs a new filename (or a CACHE_NAME bump) to reach installed copies.
  if (FONTS.includes(url.origin) || (url.origin === self.location.origin && url.pathname.includes('/img/'))) {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(event.request, copy)); }
      return res;
    })));
    return;
  }

  event.respondWith(caches.match(event.request).then(plain).then(response => response || fetch(event.request)));
});
