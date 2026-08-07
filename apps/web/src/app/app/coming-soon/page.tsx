/**
 * Route mount for the coming-soon placeholder mini-app.
 *
 * V1 pattern: each mini-app gets a one-line re-export at
 * `apps/web/src/app/app/<slug>/page.tsx`. Explicit and boring on purpose
 * — see comment in `lib/mini-apps/client-registry.ts` for why we didn't
 * jump straight to a dynamic `[slug]/page.tsx` proxy.
 */
export { default } from '@nothing-mini-apps/coming-soon/page';
