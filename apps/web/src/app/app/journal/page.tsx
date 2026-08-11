/**
 * Next re-export shim for the Journal mini-app.
 *
 * The whole mini-app implementation lives at @nothing-mini-apps/journal/page —
 * this Server Component just re-exports it as the /app/journal route so
 * Next's typed-routes generator picks up the new segment.
 */
export { default } from '@nothing-mini-apps/journal/page';
