/**
 * Route → mini-app-context map.
 *
 * v0.5.3 (#96): the ASSISTANT bottom-nav tab is now the sole entry point to
 * the copilot from a mini-app (the per-mini-app "◐ ASK" chip is gone).
 * When the user is inside a feedable mini-app, the ASSISTANT tab shows an
 * orbiting dot animation to hint "the copilot has fresh context here — tap
 * to ask about it". Tapping the tab navigates to
 * `/app/assistant?scope=<slug>` so the assistant surface can seed the thread
 * with the right context. The `<slug>` matches the mini-app manifest.slug.
 *
 * Hardcoded here (rather than per-mini-app `context.ts`) because the map is
 * tiny (5 entries) and the shell wants a single lookup on every route change.
 * If this grows beyond ~10 entries or starts carrying per-mini-app prompt
 * seeds, extract to `apps/mini-apps/<slug>/context.ts` and re-aggregate here.
 *
 * Not tied to `TABS` in TabBar.tsx — this is a *data* file, TabBar is the
 * *render* file. Keep them decoupled so the TabBar stays a dumb render layer.
 */

export interface MiniAppContext {
  /** Manifest slug — becomes `?scope=<slug>` in the assistant URL. */
  scope: string;
  /** Human label, mainly for future tooltips / a11y announcements. */
  label: string;
}

/**
 * Longest-prefix match against the current pathname wins. Order the entries
 * so more-specific paths appear first if we ever add nested mini-app routes.
 */
const ROUTE_MAP: readonly (readonly [string, MiniAppContext])[] = [
  ['/app/calorie-lite', { scope: 'calorie-lite', label: 'Fitness Pal' }],
  ['/app/gym-routine', { scope: 'gym-routine', label: 'Gym Routine' }],
  ['/app/pomodoro', { scope: 'pomodoro', label: 'Pomodoro' }],
  ['/app/reminders', { scope: 'reminders', label: 'Reminders' }],
  // coming-soon is a placeholder tile — no copilot context.
] as const;

/**
 * Given a pathname (e.g. `/app/calorie-lite/`), return the mini-app context
 * or null if the route is chrome (home, assistant, settings, launcher…).
 *
 * Startup / SSR: pass `pathname ?? ''` — an empty string returns null cleanly.
 */
export function getMiniAppContext(pathname: string): MiniAppContext | null {
  for (const [prefix, ctx] of ROUTE_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return ctx;
    }
  }
  return null;
}

/**
 * Build the assistant URL for a given context. Kept as a helper so the TabBar
 * and any other caller emit the identical `?scope=<slug>` shape.
 */
export function assistantUrlForContext(ctx: MiniAppContext | null): string {
  if (!ctx) return '/app/assistant';
  return `/app/assistant?scope=${encodeURIComponent(ctx.scope)}`;
}
