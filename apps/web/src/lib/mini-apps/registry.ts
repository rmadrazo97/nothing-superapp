/**
 * Server-side mini-app registry — static.
 *
 * v0.3.1 shipped a filesystem-scan registry that walked
 * `apps/mini-apps/<slug>/manifest.ts` at request time. It worked locally
 * because dev runs from the monorepo root, but on Vercel the serverless
 * function bundle doesn't include `apps/mini-apps/*` — `fs.readdir` returned
 * empty and the launcher rendered "No mini-apps installed yet". Fixed here
 * by switching to a static import list: each mini-app's `manifest` export is
 * pulled in at compile time, so bundlers include everything they need and
 * there's zero runtime filesystem work.
 *
 * Cost of the change: adding a mini-app now touches TWO files instead of
 * one (this file and `client-registry.ts` for the component loader). Both
 * changes are one-line appends in the same alphabetical section. Net story
 * is still "add a mini-app in 6 lines" — six lines just distributed
 * differently.
 *
 * Discovery precedence unchanged: still returns manifests sorted by slug so
 * the tile order is deterministic across renders.
 */
import type { MiniAppManifest } from '@nothing/shared';

// Static imports — bundler traces these transitively and includes each
// mini-app package in the deployment. Keep in slug-alphabetical order so
// diffs stay clean when new mini-apps land.
import calorieLiteManifest from '@nothing-mini-apps/calorie-lite/manifest';
import comingSoonManifest from '@nothing-mini-apps/coming-soon/manifest';
import gymRoutineManifest from '@nothing-mini-apps/gym-routine/manifest';
import pomodoroManifest from '@nothing-mini-apps/pomodoro/manifest';

const MANIFESTS: MiniAppManifest[] = [
  calorieLiteManifest,
  comingSoonManifest,
  gymRoutineManifest,
  pomodoroManifest,
].sort((a, b) => a.slug.localeCompare(b.slug));

/**
 * Returns every installed mini-app's manifest. Callable from Server
 * Components, Route Handlers, and Client Components — pure synchronous
 * access to a compile-time constant, no fs, no async.
 *
 * Signature kept as an async function so existing call sites (which already
 * `await loadInstalledMiniApps()`) don't need to change.
 */
export async function loadInstalledMiniApps(): Promise<MiniAppManifest[]> {
  return MANIFESTS;
}
