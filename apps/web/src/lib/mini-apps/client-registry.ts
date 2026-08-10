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

/**
 * Props every mini-app settings panel accepts. Kept as a single-callback
 * contract so the shared MiniAppSettingsSheet stays dumb — it owns the
 * open/close animation and the modal chrome; the panel decides when it's
 * done (e.g. after a successful save).
 */
export type MiniAppSettingsProps = {
  onClose: () => void;
};

type MiniAppSettingsLoader = () => Promise<{
  default: ComponentType<MiniAppSettingsProps>;
}>;

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
  reminders: () =>
    import('@nothing-mini-apps/reminders/page') as Promise<{
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

/**
 * slug → lazy loader for a mini-app's settings panel. Only mini-apps that
 * ship a `settings.tsx` (and declare `settings: {}` in their manifest) get
 * an entry here. Unregistered slugs cause `getMiniAppSettingsComponent` to
 * return null so callers can gracefully skip rendering the cog button.
 *
 * Kept as a separate map from MINI_APP_COMPONENTS so the settings bundle
 * doesn't get pulled in with the mini-app's page code (users who never open
 * settings never download the panel).
 */
const MINI_APP_SETTINGS: Record<string, MiniAppSettingsLoader> = {
  'calorie-lite': () =>
    import('@nothing-mini-apps/calorie-lite/settings') as Promise<{
      default: ComponentType<MiniAppSettingsProps>;
    }>,
  'gym-routine': () =>
    import('@nothing-mini-apps/gym-routine/settings') as Promise<{
      default: ComponentType<MiniAppSettingsProps>;
    }>,
  reminders: () =>
    import('@nothing-mini-apps/reminders/settings') as Promise<{
      default: ComponentType<MiniAppSettingsProps>;
    }>,
};

/**
 * Returns a dynamically-loaded settings component for the given mini-app
 * slug, or null when the slug hasn't registered one. The MiniAppSettingsSheet
 * uses this — passing null slugs is fine (they no-op).
 */
export function getMiniAppSettingsComponent(
  slug: string,
): ComponentType<MiniAppSettingsProps> | null {
  const loader = MINI_APP_SETTINGS[slug];
  if (!loader) return null;
  return dynamic(loader, {
    // ssr:false — settings panels are always opened from client-side
    // interaction, so pre-rendering them costs bytes for nothing.
    ssr: false,
  });
}

/**
 * True when the given slug has a registered settings panel. Cheap check so
 * page components can conditionally render the cog without importing the
 * component itself.
 */
export function hasMiniAppSettings(slug: string): boolean {
  return slug in MINI_APP_SETTINGS;
}
