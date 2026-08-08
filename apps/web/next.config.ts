import type { NextConfig } from 'next';

/**
 * Turbopack (Next 16) needs every workspace package that ships raw TS/TSX
 * added to `transpilePackages`. That includes the mini-apps runtime SDK and
 * every mini-app under `apps/mini-apps/*` — the harness re-exports each
 * mini-app's page component into a Next route (see
 * `apps/web/src/app/app/<slug>/page.tsx`) and reads their manifests at
 * request-time via the registry loader.
 *
 * The `@nothing-mini-apps/*` wildcard means we don't have to edit this file
 * every time task 12+ adds a new mini-app — as long as the workspace package
 * name follows the convention, Turbopack picks it up.
 */
const nextConfig: NextConfig = {
  transpilePackages: [
    '@nothing/shared',
    '@nothing/mini-apps-runtime',
    '@nothing-mini-apps/calorie-lite',
    '@nothing-mini-apps/coming-soon',
    '@nothing-mini-apps/gym-routine',
    '@nothing-mini-apps/pomodoro',
  ],
  experimental: { typedRoutes: true },
};

export default nextConfig;
