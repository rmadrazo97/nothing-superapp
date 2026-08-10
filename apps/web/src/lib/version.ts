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

export const APP_VERSION = '0.5.1';
export const APP_RELEASE_DATE = '2026-08-10'; // ISO — YYYY-MM-DD

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
    version: '0.5.1',
    date: '2026-08-10',
    highlights: [
      'Fitness Pal — Calorie Lite renamed to Fitness Pal now that it covers meals + macros + water + weight (slug + API paths unchanged, so live bookmarks keep working).',
      'Launcher tile emoji — 🍽️ Fitness Pal, 🏋️ Gym, 🍅 Pomodoro, ⏰ Reminders, ✨ More soon. Emoji direction is intentional (chrome vs. product).',
      'Nav bar SVG icons — 4-point spark for Assistant, 2×2 dot grid for Home, 3 sliders for Settings. Minimalist stroke, currentColor.',
      'Public marketing landing at / — signed-out visitors now see product + tile list + Sign in CTA instead of the bare magic-link form.',
      'REQUEST AN APP — dashed-outline strip below the launcher opens a modal for user asks (max 500 chars, rate-limited to 5/day/user). Alex reviews the queue weekly.',
      'Ingredient resolver — plan ingredients in Spanish (or with typos) now resolve to real macros via a curated food_aliases table + pg_trgm fuzzy fallback. Fixes zero-kcal rows on meal-plan logs.',
      'Unresolved calorie rows — show an "◐ NO MACROS" tag + cadmium accent instead of a blank right side; explicit invitation to tap ✎ EDIT.',
      'Auth ?next= preservation — deep-linked URLs (e.g. /paywall?ref=promo) round-trip cleanly through sign-in via a same-origin allow-list. Open-redirect safe.',
      'Bug fixes — streak chip no longer pushes the ⚙ cog off-screen on narrow iPhones; ← Back links are ← BACK everywhere; + NEW ROUTINE / + NEW REMINDER shrunk from hero fills to ghost variants; text-glyph gear (⚙︎) instead of the macOS colored graphic; Privacy page copy updated (chat is persisted).',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-08-10',
    highlights: [
      'Assistant rebuilt — persistent chat threads, streaming ▊ cursor, markdown-lite renderer, Copy · Regen · Continue actions, right-aligned cadmium user bubbles, empty-state prompt cards.',
      'ThreadDrawer with rename + delete + cadmium active-row highlight; ?t=<uuid> URL binding for deep-linkable chats.',
      'Reminders mini-app + agent loops — Nothing Superapp\'s answer to Claude loops. A reminder can be a simple NOTIFY or an autonomous copilot prompt on a schedule. 6 templates ship (weekly meal review, gym adherence check, grocery list from active plan, etc). Cron runs from GitHub Actions every 5 min.',
      'Meal-plan entries collapse — plan-logged ingredients group under one card on TODAY, expand for per-ingredient edit/delete, delete whole meal in two taps.',
      'Calorie entries — inline edit + delete on every row.',
      'Meal plans + gym routines — delete affordance with two-tap confirm.',
      'Launcher — 2-tile-per-row grid on every viewport (was collapsing to 1 col on narrow iPhones).',
      'PWA polish — pinch-zoom + double-tap zoom disabled; feels native on iOS home-screen installs.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-08-09',
    highlights: [
      'Copilot upgraded to a real agent (Vercel AI SDK v5) with 19 hand-written tools + 32 framework-auto CRUD tools across every mini-app.',
      'Multimodal copilot — attach food/menu photos or dictate meals; Kimi K2.6 vision handles both.',
      'In-app copilot drawer inside Calorie Lite (◐ ASK chip) — knows your remaining macros and active plan; find_equivalent_food, suggest_from_menu, extract_macros_from_text.',
      'Meal plans v2 — nutritionist-style options-per-meal + rules block (free_meal, hydration, vegetables, protein-swap). Real diet seeded as Diet Jam v1.',
      'Gym routine v2 — top-set/back-off blocks, RIR ranges, supersets, unilateral, bilingual, cardio and conventions.',
      'USDA SR Legacy foods live — 7,946 rows (was 153). Ingredient resolution + search coverage jumped 50×.',
      'Mini-app resource framework — declare a resources.ts, get REST + agent tools + useResource() hook for free.',
      'PWA safe-area fixes on Shell + overlays for Dynamic Island + home indicator clearance.',
    ],
  },
  {
    version: '0.3.2',
    date: '2026-08-09',
    highlights: [
      'Web Push notifications — opt-in banner, VAPID + service worker push handler, per-topic allow-list.',
      'Release broadcaster — GitHub Action fires a Web Push to every opt-in the moment APP_VERSION bumps on main.',
      'Settings → Notifications adds topic checkboxes (Releases, Insights) + a Send test button that hits your device.',
    ],
  },
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
