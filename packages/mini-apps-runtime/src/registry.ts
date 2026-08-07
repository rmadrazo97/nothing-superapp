import type { MiniAppManifest } from '@nothing/shared';

/**
 * Registry of all installed mini-apps. Populated at build time by a scan of
 * apps/web/src/mini-apps/<slug>/manifest.ts files. In v1, the generated file
 * lives at apps/web/src/mini-apps/registry.generated.ts and is imported by
 * the home grid (task 10).
 *
 * This module provides the runtime type + small helpers for consumers that
 * want to filter/query manifests.
 */
export type MiniAppRegistry = readonly MiniAppManifest[];

export function filterByRoute(
  registry: MiniAppRegistry,
  route: string,
): MiniAppManifest | undefined {
  return registry.find((m) => m.route === route);
}

export function requiresSubscription(manifest: MiniAppManifest): boolean {
  return manifest.requiresSubscription !== false;
}
