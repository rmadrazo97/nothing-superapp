/**
 * Client-side mini-app dispatch table.
 *
 * The RSC boundary makes it awkward to hand a React component from the
 * server registry to a client renderer — React Server Components can be
 * streamed but arbitrary Client Components must be reachable from the
 * client bundle at compile time. So we split the loader:
 *
 *   - `lib/mini-apps/registry.ts` (server) — metadata only: slug, name,
 *     icon, route, requiresSubscription.
 *   - This file (client-safe) — a slug → dynamic-component map. Each entry
 *     uses `next/dynamic` so the mini-app's page code is only fetched when
 *     the tile is tapped, not on every launcher render.
 *
 * The map itself has to enumerate mini-apps by name because bundlers can't
 * resolve `dynamic(() => import(computed))`. That's fine — adding a
 * mini-app is a two-line touch (one entry here, one workspace member) and
 * the *interesting* discovery (metadata + presence in the launcher) still
 * flows through the fs-based registry.
 *
 * The v1 route-based navigation model doesn't actually need this map — the
 * home grid uses `manifest.route` and `next/link` to navigate to the
 * corresponding `/app/<slug>/page.tsx`. `getMiniAppComponent` is exposed
 * for the future dynamic-proxy pattern (a single `[slug]/page.tsx` that
 * renders whichever mini-app's component matches `params.slug`), which we
 * may adopt once there are 3+ mini-apps and the per-route boilerplate
 * becomes annoying.
 */
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

type MiniAppLoader = () => Promise<{ default: ComponentType }>;

// One entry per installed mini-app. Keep in slug-alphabetical order so PR
// diffs stay clean.
const MINI_APP_COMPONENTS: Record<string, MiniAppLoader> = {
  'calorie-lite': () =>
    import('@nothing-mini-apps/calorie-lite/page') as Promise<{
      default: ComponentType;
    }>,
  'coming-soon': () =>
    import('@nothing-mini-apps/coming-soon/page') as Promise<{
      default: ComponentType;
    }>,
  'gym-routine': () =>
    import('@nothing-mini-apps/gym-routine/page') as Promise<{
      default: ComponentType;
    }>,
  pomodoro: () =>
    import('@nothing-mini-apps/pomodoro/page') as Promise<{
      default: ComponentType;
    }>,
};

/**
 * Resolves a mini-app slug to its dynamically-loaded page component.
 * Returns null when the slug isn't registered — callers should render a
 * 404 in that case, not throw.
 */
export function getMiniAppComponent(slug: string): ComponentType | null {
  const loader = MINI_APP_COMPONENTS[slug];
  if (!loader) return null;
  return dynamic(loader, { ssr: true });
}

/**
 * Convenience for navigation code that has a slug but wants the canonical
 * URL. Mirrors the naming convention `/app/<slug>` used by every mini-app
 * in v1 — kept as a helper so a future URL-scheme change (e.g. namespaced
 * `/app/mini/<slug>`) lands in one place.
 */
export function getMiniAppRoute(slug: string): string {
  return `/app/${slug}`;
}
