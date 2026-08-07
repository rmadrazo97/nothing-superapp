import { defineMiniApp } from '@nothing/mini-apps-runtime';

/**
 * Calorie Lite — the reference mini-app.
 *
 * Proves the harness plumbing end-to-end: registry discovery, workspace
 * package re-export, runtime SDK (`useUser` / `usePreferences` / `useEvents`),
 * paywall gate at the Proxy layer AND at the API layer, DB reads/writes
 * against `app_calorie_entries` with RLS.
 *
 * `requiresSubscription: true` — this tile is the paid product. Unentitled
 * users see it locked in the launcher; if they somehow navigate directly,
 * the Proxy redirects to /paywall.
 */
export default defineMiniApp({
  slug: 'calorie-lite',
  name: 'Calorie Lite',
  description: 'Log meals, tally today against your target.',
  icon: '◐',
  route: '/app/calorie-lite',
  requiresSubscription: true,
});
