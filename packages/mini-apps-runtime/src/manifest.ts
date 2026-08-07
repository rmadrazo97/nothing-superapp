import type { MiniAppManifest } from '@nothing/shared';

/**
 * Type-safe manifest constructor. Every mini-app calls this in its manifest.ts:
 *
 *   export default defineMiniApp({
 *     slug: 'calorie-lite',
 *     name: 'Calorie',
 *     description: 'Track daily kcal + macros',
 *     icon: '<svg ...>', // inline SVG
 *     route: '/app/calorie',
 *     requiresSubscription: true,
 *   });
 *
 * Validates slug (lowercase kebab-case) and route (/app/ prefix) at import time
 * so a malformed manifest fails the build, not runtime navigation. Defaults
 * `requiresSubscription` to true when omitted — v1 gates everything behind Pro.
 */
export function defineMiniApp(manifest: MiniAppManifest): MiniAppManifest {
  if (!manifest.slug || !/^[a-z][a-z0-9-]*$/.test(manifest.slug)) {
    throw new Error(
      `Mini-app slug must be lowercase kebab-case: got "${manifest.slug}"`,
    );
  }
  if (!manifest.route.startsWith('/app/')) {
    throw new Error(
      `Mini-app route must start with /app/: got "${manifest.route}"`,
    );
  }
  return { requiresSubscription: true, ...manifest };
}
