const CACHE_NAME = 'lingolocal-v3';
const urlsToCache = ['./', './index.html', './manifest.json', './icon-192.svg', './icon-512.svg', './audio/manifest.json', './privacy.html'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(urlsToCache);
    // Phrase audio IS the offline product, so precache every clip rather than
    // waiting for a first play. Added one by one on purpose: cache.addAll is
    // all-or-nothing, and one missing clip must not fail the whole install.
    try {
      const { files } = await (await fetch('./audio/manifest.json')).json();
      await Promise.all(files.map(f => cache.add('./audio/' + f).catch(() => {})));
    } catch (e) {
      // No manifest — app still installs, clips fall back to device TTS.
    }
  })());
  self.skipWaiting();
});

// All 7 apps share one origin, so caches.keys() lists every app's caches.
// Delete only this app's old versions — purging the rest wipes the others.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('lingolocal-') && k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
