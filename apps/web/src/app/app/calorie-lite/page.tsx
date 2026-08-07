/**
 * Route mount for the calorie-lite reference mini-app.
 *
 * V1 pattern: each mini-app gets a one-line re-export at
 * `apps/web/src/app/app/<slug>/page.tsx`. Explicit and boring on purpose
 * — see comment in `lib/mini-apps/client-registry.ts` for why we didn't
 * jump straight to a dynamic `[slug]/page.tsx` proxy.
 *
 * Access is gated at TWO layers:
 *   1. The Proxy (src/proxy.ts + lib/supabase/middleware.ts) redirects
 *      unentitled users hitting `/app/*` to `/paywall`.
 *   2. The API route (`/api/mini-apps/calorie-lite/entries`) returns 402
 *      to unentitled callers as defence-in-depth.
 */
export { default } from '@nothing-mini-apps/calorie-lite/page';
