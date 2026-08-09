/**
 * Route mount for the reminders mini-app.
 *
 * One-line re-export — the mini-app itself lives in
 * `apps/mini-apps/reminders/`. Access is subscription-gated at the Proxy
 * layer + at the tick handler (defence in depth).
 */
export { default } from '@nothing-mini-apps/reminders/page';
