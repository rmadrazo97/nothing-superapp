/**
 * Next re-export shim for the Habits mini-app.
 *
 * The whole mini-app implementation lives at @nothing-mini-apps/habits/page —
 * this Server Component just re-exports it as the /app/habits route so
 * Next's typed-routes generator picks up the new segment.
 */
export { default } from '@nothing-mini-apps/habits/page';
