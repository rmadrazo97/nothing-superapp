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

export const APP_VERSION = '0.5.5';
export const APP_RELEASE_DATE = '2026-08-11'; // ISO — YYYY-MM-DD

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
    version: '0.5.5',
    date: '2026-08-11',
    highlights: [
      'Prod DB drift fixed — 5 migrations (020 mini_app_settings, 021 body_metrics, 023 food_search_ranking, 024 profile_timezone, 025 tool_idempotency) were committed to the tree but never applied to prod Supabase. Body composition tracker, in-sub-app settings persistence, food-search ranking, TIMEZONE field, and tool-call idempotency were ALL silently broken until this release. Applied all 5 by hand + shipped scripts/verify-migrations-applied.mjs so the drift can never recur.',
      'Assistant tool idempotency extended — the 30-second-bucket dedupe from v0.5.3 now guards 7 more write tools (log_weight, create_gym_routine, create_meal_plan, log_meal_from_plan, start_pomodoro, toggle_reminder, trigger_reminder_now). No more accidental doubles when the model retries a tool call mid-turn.',
      'Settings profile — /api/profile failures now surface as an inline error card with a RELOAD button, instead of silently rendering empty fields. Root cause of the v0.5.3 latent-500 was that the useEffect catch flipped profileLoaded=true unconditionally.',
      'CI safety net — new scripts/verify-migrations-applied.mjs introspects every migration file against prod on every push to main. Any DDL committed but not applied fails the release step. Would have caught the v0.5.3 timezone incident in the same PR.',
      'Supabase Security Advisor cleanup — migration 026 pins set_updated_at() search_path (privilege-escalation guard), adds explicit "no access" policies to push_broadcasts + push_deliveries (rls_enabled_no_policy → clean).',
    ],
  },
  {
    version: '0.5.4',
    date: '2026-08-10',
    highlights: [
      'Generative UI — the assistant now renders answers as instrument panels instead of prose. New pixel-panel component library (8 components: PixelCard, PixelTicker, PixelBarChart, PixelLineChart, PixelProgressDots, PixelArc, PixelDataTable, PixelMetricGrid) sharing a 3px cell + 1px gap grid + a signature 2×2 cadmium LED cluster in the top-right of every panel. Same pixel-dot idiom as PixelLoader — the loading state now IS the design language of the answer.',
      'Assistant render_* tools — 7 new zero-side-effect tools (render_stat_ticker / render_bar_chart / render_line_chart / render_progress_dots / render_arc_graph / render_data_table / render_metric_grid). System prompt updated with a "Generative UI" block steering the model to prefer these over markdown for anything quantitative: "how many kcal left today", "show my weight trend", "compare last 4 weeks by muscle group" now come back as panels, not paragraphs.',
      'CopilotChat render pipeline — `renderPixelPayload()` switch wired into the tool-part render loop; ToolCallCard fallback preserved for tools with side effects (create_reminder etc). Every render_* output travels as {version:1, kind:<name>, data:<shape>} so future versions can bump without breaking hydration.',
      'Design proof-sheet at /dev/pixel-ui — every render_* payload rendered against representative sample data so the family reads as one instrument suite. Reference: services/growth/campaigns/nothing-superapp/design/pixel-ui-v0.5.4.md.',
    ],
  },
  {
    version: '0.5.3',
    date: '2026-08-10',
    highlights: [
      'Assistant — first message no longer aborts its own stream. Real root cause was DefaultChatTransport rebuilding on every threadId change (useMemo dep); useChat swaps its internal Chat when the transport ref changes = same as a key remount. Fix: stable transport, dynamic thread_id + timezone travel via prepareSendMessagesRequest reading a ref. 0 orphan "New chat" rows across cold-load reproductions.',
      'Assistant timezone — client now sends the browser\'s IANA tz on every /api/copilot request; server injects "USER TIMEZONE + local wall-clock" into the system prompt. "Remind me in 10 min" now schedules 10 min from YOUR clock, not UTC. TIMEZONE field added to Settings > Profile; persisted to profiles.timezone (migration 024).',
      'Assistant tool idempotency — write tools now dedupe within a 30s window per (user, tool, input). Migration 025 adds a partial unique index on tool_audit_log(user_id, idempotency_key). Wired into create_reminder + log_calorie_entry (the two observed prod duplication hot paths); other write tools land in a follow-up.',
      'Composer icons — swapped the abstract ◐ / ○ glyphs for real 16×16 SVG camera + microphone icons.',
      'Chat width + PixelLoader — messages column widened to fill the shell (user bubbles right / assistant left, per-bubble max-width). Generic spinner replaced with a 5×5 pixel-grid twinkle animation across THINKING / LOADING CHAT / tool-in-progress. Respects prefers-reduced-motion.',
      'Fitness Pal PLAN — full redesign via the frontend-design skill. Meal plan as a prescription slip, not a dashboard: RX kicker + Doto numerals in a segmented MacroTape ticker (KCAL · P · C · F receipt-printer aesthetic) + numbered TimelineRail meal stations with 6px green LED for "logged today". DELETE removed from the DETAIL header entirely (destroys only via LIST swipe). CREATE form got worksheet chrome + stamp-bar macro presets with live tape preview.',
      'Fitness Pal chrome — killed the ◐ ASK chip (ASSISTANT bottom-nav tab is the only entry point now); killed the WATER tab (kept the DB table, removed the tab + log_water tool); big streak card compacted to a single-line eyebrow (STREAK · 2D · N/30 THIS MONTH). Header ~60% shorter.',
      'ASSISTANT nav-tab context animation — a 2px cadmium dot orbits the spark icon when the current view has feedable context (any mini-app). Static dot fallback under prefers-reduced-motion. Tap navigates to /app/assistant?scope=<slug> with automatic context injection.',
      'ADD MEAL overflow fix — the card + food rows no longer bleed past the phone frame at long food names.',
      'Food search ranking — sorted by canonical-food boost + prefix/word-initial scoring + demotion of noise (Babyfood *, Alcoholic w/ brand, Agutuk *, *, strained/junior, *, frozen unprepared, Fast foods/<chain>). Migration 023 + 251-entry canonical seed at packages/shared/canonical-foods.json. Searching "sweet potato" now leads with the canonical row, not babyfood variants.',
      'ADD MEAL → new FROM PLAN tab — pick today\'s meal-slot options from your active plan and log the whole thing in one tap. Empty state points to PLAN if you don\'t have an active plan.',
      'Reminders → Reminders and Tasks — renamed to reflect that it holds both notifications (fire at time X) and autonomous copilot tasks (assistant runs on a schedule to do work + push the result). Info banner explains "TWO KINDS · ONE LIST"; dismissible + persisted.',
      'Reminders layout — content now respects the shell column (no huge blank right side); + NEW REMINDER shrunk to a compact ghost chip matching + ADD MEAL sizing.',
      'Gym routine cards tap-to-START — the whole card body is the primary action now; taps start a new session from that routine (or resumes if a live session is tied to it). Top-right START → / RESUME → chip announces intent; live cards get accent border + LIVE · IN PROGRESS · Resume →. EDIT / DELETE moved to swipe (DELETE → undo snackbar).',
      'Settings changelog — progressive disclosure: first expand shows only the latest release; a second ▶ SHOW OLDER (N RELEASES) toggle reveals the rest inside a max-height scrollable box (no more page-takeover).',
      'Lint restored — Next 16 removed next lint AND doesn\'t bundle any ESLint config; ESLint 9 flat config + typescript-eslint installed at the root, apps/web lint script rewired, legacy inline eslint-disable comments neutralised via an inert-plugin Proxy. pnpm --filter @nothing/web lint runs clean.',
      'Supabase SMTP unblock — scripts/supabase-smtp-configure.sh + playbook at services/growth/campaigns/nothing-superapp/reports/supabase-smtp-unblock.md let Alex apply Resend SMTP via the Management API (bypasses the dashboard bug that has been silently 400ing on save since before v0.5.0).',
    ],
  },
  {
    version: '0.5.2',
    date: '2026-08-10',
    highlights: [
      'Assistant race fixed — first-message no longer aborts its own stream. Removed the key-based remount in AssistantClient + added a self-created-thread guard; the 1-in-5 orphan "New chat" pattern is dead.',
      'Assistant polish — markdown tables killed via system-prompt rule (renderer defers to v0.5.3); redundant cadmium + in the header removed so it stops colliding with composer Send.',
      'In-sub-app settings framework — <MiniAppSettingsPanel> + <SettingsSection/Field/Select/Toggle/Button> + useMiniAppSettings hook + migration 020 (mini_app_settings jsonb per user × slug). Backed by /api/mini-app-settings/[slug].',
      'Fitness Pal + Reminders settings refactored onto the framework (Fitness Pal 823 → 554 LoC, 33% shorter; Reminders 178 → 139).',
      'Gym settings — new UNITS section: WEIGHT (LBS/KG) + LENGTH (IN/CM) pills. First-flip couples KG↔CM and LBS↔IN; independent after that.',
      'Gym in-session HOW TO — every exercise card gets a ⓘ pill that opens a bottom-sheet with the drawn animation + steps + muscle tags. Same detail component now backs the standalone /exercises/[id] route too.',
      'Gym BW placeholder killed — body-weight exercises hide the weight input and show a compact "Body weight" pill; weighted exercises show LBS or KG (from your gym settings) instead of the confusing BW.',
      'Body composition tracker — new MEASUREMENTS tab in Gym: weekly Glutes / Waist / Chest / Thighs / Biceps / Weight log. Integer mm + g canonical storage (no float drift when you flip units). Migration 021 + auto-generated copilot tools via the resource framework.',
      'Fitness Pal PLAN tab redesign — LIST view shows every plan (SET ACTIVE · EDIT · DUPLICATE · DELETE on swipe with 5s undo); DETAIL view moved DELETE into the ⋯ menu and killed the giant red RE-LOG buttons in favour of a compact chip + "Logged · tap to re-log" ghost; CREATE/EDIT is a single-scroll form with macro-split presets (Balanced / High-P / Keto / Custom) + meal→option→ingredient repeaters using the existing food search. Plans are now user-authorable end-to-end without touching the assistant.',
      'SwipeableRow shell — one <SwipeableRow> component (swipe-left OR long-press, ⋯ affordance, keyboard-menu fallback) plus a UndoSnackbar provider. Wired on the assistant thread drawer, meal-plan cards, and measurement entries; more rollouts to come.',
      'Shared <BottomSheet> — touch-drag close (~80px threshold), scrim dismiss, Escape — now used by the gym HOW TO sheet and the measurements entry form.',
    ],
  },
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
