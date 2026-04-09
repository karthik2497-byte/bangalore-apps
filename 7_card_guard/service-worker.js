const CACHE_NAME = 'cardguard-v1';
const urlsToCache = ['./', './index.html', './manifest.json', './icon-192.svg', './icon-512.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.action;
  if (action === 'markPaid') {
    event.waitUntil(clients.openWindow('/?action=markPaid&cardId=' + (event.notification.data ? event.notification.data.cardId : '')));
  } else if (action === 'snooze') {
    event.waitUntil(clients.openWindow('/?action=snooze&cardId=' + (event.notification.data ? event.notification.data.cardId : '')));
  } else {
    event.waitUntil(clients.openWindow('/'));
  }
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'CardGuard', body: 'You have a bill reminder!' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.svg',
      badge: './icon-192.svg',
      actions: [
        { action: 'markPaid', title: 'Mark as Paid' },
        { action: 'snooze', title: 'Snooze' }
      ],
      data: data.data || {}
    })
  );
});
