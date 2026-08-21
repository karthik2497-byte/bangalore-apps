importScripts('./reminder-core.js');

const CACHE_NAME = 'cardguard-v2';
// The page mirrors its state here so this worker can decide what is due while
// the app is closed. Kept in its own cache so the activate purge never eats it.
const STATE_CACHE = 'cardguard-state';
const STATE_URL = './__cardguard_state';

const urlsToCache = [
  './', './index.html', './manifest.json', './privacy.html',
  './reminder-core.js', './icon-192.svg', './icon-512.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE_NAME && k !== STATE_CACHE).map(k => caches.delete(k))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.open(CACHE_NAME)
      .then(cache => cache.match(event.request))
      .then(hit => hit || fetch(event.request))
  );
});

// ---------------- background reminders (no server involved) ----------------

async function readState() {
  const cache = await caches.open(STATE_CACHE);
  const res = await cache.match(STATE_URL);
  return res ? res.json() : null;
}

async function markNotified(keys) {
  const cache = await caches.open(STATE_CACHE);
  const res = await cache.match(STATE_URL);
  if (!res) return;
  const state = await res.json();
  state.notified = state.notified || {};
  keys.forEach(k => { state.notified[k] = 1; });
  // ponytail: the page owns this record too, so a reminder that fires while the
  // app happens to be open can be written twice. Harmless — same `tag` means
  // the second notification replaces the first instead of stacking.
  await cache.put(STATE_URL, new Response(JSON.stringify(state), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

// Returns what it did, so the page's Test button can report the truth instead
// of assuming the worker succeeded.
async function runReminderCheck() {
  const state = await readState();
  if (!state) return { due: 0, shown: 0, error: 'no state mirrored yet' };

  const due = CardGuardCore.dueReminders(state, new Date());
  if (!due.length) return { due: 0, shown: 0 };

  const shown = [];
  let error = null;
  for (const r of due) {
    try {
      await self.registration.showNotification(r.title, {
        body: r.body,
        icon: './icon-192.svg',
        badge: './icon-192.svg',
        tag: 'cardguard-' + r.cardId,
        data: { cardId: r.cardId },
        actions: [
          { action: 'markPaid', title: 'Mark as Paid' },
          { action: 'snooze', title: 'Snooze' }
        ]
      });
      shown.push(r.key);
    } catch (e) {
      // Usually "permission not granted". Do not record it as notified, so the
      // reminder is retried once the user allows notifications.
      error = e.message;
    }
  }
  if (shown.length) await markNotified(shown);
  return { due: due.length, shown: shown.length, error: error };
}

self.addEventListener('periodicsync', event => {
  if (event.tag === 'cardguard-check') event.waitUntil(runReminderCheck());
});

// Manual trigger, used by the page's "Test" button in Settings.
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'check-reminders') return;
  const reply = port => runReminderCheck().then(result => port.postMessage({ type: 'check-result', result }));
  const port = event.ports && event.ports[0] ? event.ports[0] : event.source;
  event.waitUntil(reply(port));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const cardId = event.notification.data ? event.notification.data.cardId : '';
  const action = event.action;
  let url = './index.html';
  if (action === 'markPaid') url += '?action=markPaid&cardId=' + cardId;
  else if (action === 'snooze') url += '?action=snooze&cardId=' + cardId;
  event.waitUntil(clients.openWindow(url));
});

// Kept for the Phase C2 server push path (EXECUTION_PLAN §4.4). Nothing sends
// to it yet — periodicsync above is what actually fires reminders today.
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
