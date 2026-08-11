/**
 * Nothing Superapp service worker — v0.3.2
 *
 * Responsibilities:
 *   1. PWA installability — respond to `fetch` events (Chrome + Edge
 *      require a registered SW to enable "Install app").
 *   2. Web Push — handle `push` events (show the notification the server
 *      sent) + `notificationclick` (focus an existing tab or open a new
 *      one at the URL from the payload).
 *
 * NO offline cache yet — caching auth-cookie-scoped API responses is
 * subtle and easy to get wrong (stale entitlement state, cached copilot
 * responses that don't belong to the current user). Deferred.
 *
 * Bump SW_VERSION on any material change so browsers pick up the new
 * install script and the activate event clears the old registration.
 */
const SW_VERSION = 'v0.5.9';

self.addEventListener('install', () => {
  // Skip waiting — this is a pass-through SW, no cache to warm up.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through — no interception, no caching.
  // This handler is required to exist for PWA install eligibility.
  event.respondWith(fetch(event.request));
});

// ─── Web Push ──────────────────────────────────────────────────────────────
// Payload contract (see apps/web/src/lib/push/server.ts PushPayload):
//   { title: string, body: string, url?: string, icon?: string, tag?: string }
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (err) {
      // Older browsers may deliver plaintext — fall back gracefully.
      payload = { title: 'Nothing Superapp', body: event.data.text() };
    }
  }
  const title = payload.title || 'Nothing Superapp';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'nothing-superapp',
    // Renotify only if a tag was provided — prevents silent updates.
    renotify: !!payload.tag,
    data: { url: payload.url || '/app' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    (async () => {
      const absolute = new URL(targetUrl, self.location.origin).href;
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // If we already have a tab open on the app, focus + navigate it.
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin) {
            await client.focus();
            if ('navigate' in client) {
              await client.navigate(absolute);
            }
            return;
          }
        } catch {
          // Ignore malformed client URLs.
        }
      }
      // No matching tab — open a fresh one.
      if (self.clients.openWindow) {
        await self.clients.openWindow(absolute);
      }
    })(),
  );
});
