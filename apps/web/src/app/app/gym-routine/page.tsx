/**
 * Route mount for the gym-routine mini-app landing screen.
 *
 * Multi-file re-export pattern (recommended in the mini-app spec) — each
 * sub-route lives at its own `apps/web/src/app/app/gym-routine/**` file and
 * defers to a page component under the mini-app package. Boring on
 * purpose; keeps typedRoutes happy and one file → one URL.
 *
 * Access is gated at two layers:
 *   1. Proxy (src/proxy.ts + lib/supabase/middleware.ts) redirects
 *      unentitled users hitting `/app/*` to `/paywall`.
 *   2. Every `/api/mini-apps/gym-routine/*` handler returns 402 to
 *      unentitled callers (see `_lib.ts` → `requireEntitledUser`).
 */
export { default } from '@nothing-mini-apps/gym-routine/page';
