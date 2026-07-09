const CACHE_NAME = 'nook-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
      .catch(err => console.warn("Failed to cache some files", err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Network first for everything, fallback to cache
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        // Clone the response and cache it
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, responseToCache);
        }
        return response;
      } catch (error) {
        // Network request failed, try to return cached response
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Always return a Response object to prevent TypeError crashing the worker
        return Response.error();
      }
    })()
  );
});

// ─── Web Push: task reminders ───────────────────────────────────────
// Payload shape sent by the send-task-reminders Edge Function:
//   { title, body, source_type: 'task', source_id, url }
// `url` should be `/?reminder=task:<source_id>` — App.jsx parses that
// query param on load and opens the task straight to its Scheduling tab.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

  const title = data.title || 'Nook reminder';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.source_id ? `${data.source_type}-${data.source_id}` : undefined,
    data: {
      url: data.url || '/',
      source_type: data.source_type,
      source_id: data.source_id,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus an existing Nook tab if one is open, navigating it to the target.
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      // Otherwise open a new window/tab.
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
