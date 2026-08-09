/**
 * Single source of truth for the app version + human-readable changelog.
 *
 * `APP_VERSION` MUST stay in sync with the root `package.json` `version`
 * field and the `VERSION` file at the repo root. When bumping, update all
 * three in the same commit — CI does not currently cross-check them, but
 * downstream (Settings → ABOUT card, PWA About surfaces) reads from here.
 *
 * `CHANGELOG` is human-authored and lives here — NOT in `settings/page.tsx`
 * — so the About card stays a pure renderer and future consumers (e.g. a
 * marketing landing page, a copilot "what's new" prompt) can import the
 * same array. Order: most recent release first. Each entry is short so the
 * disclosure stays scannable; deep detail lives in
 * `services/growth/campaigns/nothing-superapp/ship-log.md`.
 */

export const APP_VERSION = '0.3.1';
export const APP_RELEASE_DATE = '2026-08-09'; // ISO — YYYY-MM-DD

export type ChangelogEntry = {
  version: string;
  /** ISO YYYY-MM-DD — same format as APP_RELEASE_DATE. */
  date: string;
  highlights: string[];
};

/**
 * Most recent first. Keep each highlight to a single short line — the
 * `<details>` disclosure in the About card renders these as bullet points.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.3.1',
    date: '2026-08-09',
    highlights: [
      'Calorie Lite v3 — MyFitnessPal-tier: food search over 153 curated foods, custom foods CRUD, quantity picker with live macro preview.',
      'First-run onboarding wizard — Mifflin-St Jeor BMR → TDEE → target with sex, age, height, activity, goal direction.',
      'Water + Weight sub-mini-apps with 7-day trends and unit toggles.',
      'Reports tab — weekly summary vs last week, macros-vs-goal, cleanest and heaviest day cards.',
      'Custom meals — snapshot today’s entries into a reusable template.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-08-09',
    highlights: [
      'Live at nothing-superapp.vercel.app — public, PWA-installable, paid tiles behind $1/mo paywall.',
      'Google OAuth end-to-end via Supabase Auth.',
      'Static mini-app registry — fixes serverless bundle discovery on Vercel.',
      'Profile auto-provisioning trigger for new sign-ups.',
      'PWA manifest, service worker, toast system, error boundary, empty states, legal pages, rate limiting.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-08-08',
    highlights: [
      'Pomodoro mini-app — 25/5/15 cycle with drift-free timer and WebAudio chirp.',
      'Gym Routine mini-app — 1,324 exercises seeded, live rest timer, resume across reloads.',
      'Calorie Lite v2 — macros surfaced everywhere, streak chip with morning grace, 7-day sparkline.',
      'Three top-tier mini-apps landed the same day via parallel subagents.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-08-07',
    highlights: [
      'Mini-app harness landed — registry, runtime SDK, paywall gate, RLS.',
      'Reference Calorie Lite mini-app proves the plumbing end-to-end.',
      'Design system locked: dark, cadmium red, Space Mono + Space Grotesk + Doto.',
    ],
  },
];

/**
 * Format an ISO date (YYYY-MM-DD) as e.g. "Aug 9, 2026". Kept local so the
 * About card doesn't have to reimplement it, and so tests can import it
 * without pulling in React.
 */
export function formatReleaseDate(iso: string): string {
  // Split rather than `new Date(iso)` so we don't shift by the viewer's
  // timezone (an ISO date-only string parses as UTC midnight, which
  // becomes the previous day west of UTC).
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
