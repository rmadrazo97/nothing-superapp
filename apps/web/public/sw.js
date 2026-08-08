/**
 * Nothing Superapp service worker — v0.3
 *
 * Minimal pass-through service worker. The point of shipping one at all is
 * PWA installability (Chrome + Edge require a registered SW that responds to
 * `fetch` events to allow "Install app").
 *
 * NO offline cache in v0.3 — caching auth-cookie-scoped API responses is
 * subtle and easy to get wrong (stale entitlement state, cached copilot
 * responses that don't belong to the current user). We'll add a proper
 * cache-first shell + network-first API strategy in v0.4 with a bumped
 * cache key that invalidates on version change.
 *
 * If you change this file, bump SW_VERSION so browsers pick up the new
 * install script (the `activate` event will fire and clear old registration).
 */
const SW_VERSION = 'v0.3.0';

self.addEventListener('install', (event) => {
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
