/**
 * Server-side mini-app resource registry — static.
 *
 * Mirrors the discipline of `registry.ts` (manifests): static imports so the
 * bundler traces every resources module into the serverless function.
 *
 * Add a mini-app that declares resources? Add the import + push the module
 * onto `MODULES` in slug-alphabetical order.
 *
 * Mini-apps without a `resources.ts` (e.g. `coming-soon`, `gym-routine` in
 * this wave) simply aren't listed. The framework routes 404 for unknown
 * slug/resource combos.
 */
import type { MiniAppResource, MiniAppResourceModule } from '@nothing/shared';

import calorieLiteResources from '@nothing-mini-apps/calorie-lite/resources';
import pomodoroResources from '@nothing-mini-apps/pomodoro/resources';

const MODULES: MiniAppResourceModule[] = [
  calorieLiteResources,
  pomodoroResources,
].sort((a, b) => a.slug.localeCompare(b.slug));

const BY_SLUG = new Map<string, MiniAppResourceModule>(
  MODULES.map((m) => [m.slug, m]),
);

/** Returns every mini-app that declared any resources, alphabetized. */
export function getAllResourceModules(): MiniAppResourceModule[] {
  return MODULES;
}

/** Returns the resource module for a slug, or `null` if none is registered. */
export function getResourceModule(slug: string): MiniAppResourceModule | null {
  return BY_SLUG.get(slug) ?? null;
}

/** Returns a single resource by slug + name, or `null` if not found. */
export function getResource(slug: string, name: string): MiniAppResource | null {
  const mod = BY_SLUG.get(slug);
  if (!mod) return null;
  return mod.resources.find((r) => r.name === name) ?? null;
}
