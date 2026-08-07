/**
 * Server-side mini-app registry loader.
 *
 * Discovery is file-convention: any `apps/mini-apps/<slug>/manifest.ts` that
 * default-exports a `MiniAppManifest` gets picked up automatically — no
 * central list to keep in sync when task 12+ adds new mini-apps.
 *
 * Why parse the manifest source instead of `await import()`ing it:
 *   - Turbopack (Next 16) can only bundle dynamic imports whose module
 *     specifier is statically analyzable. A path discovered at runtime via
 *     `fs.readdir` is opaque to the bundler, so `import(pathToFileURL(…))`
 *     works in `next dev` but breaks during `next build` for anything not
 *     already resolved by the compiler.
 *   - Node.js can't natively execute `.ts` files without a loader; adding
 *     one just to boot the registry is more moving parts than the extraction
 *     itself.
 *   - The manifest is a small, fixed shape (`defineMiniApp({ ... })`) that
 *     we control end-to-end — we're the only ones authoring these files —
 *     so a minimal extractor is safe and deterministic.
 *
 * The mini-app's *runtime* code (its page component) IS still imported the
 * normal way — via a workspace-package re-export in
 * `apps/web/src/app/app/<slug>/page.tsx`. So the registry only needs the
 * manifest metadata; component loading stays in Next's bundler where it
 * belongs.
 *
 * One broken manifest must not break the launcher. Each mini-app is loaded
 * inside its own try/catch and errors are logged, not thrown.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { MiniAppManifest } from '@nothing/shared';

// Cache the scan result for the lifetime of the server process in prod.
// In dev we re-scan on every call so newly-added mini-apps appear without
// a server restart.
let cachedRegistry: MiniAppManifest[] | null = null;

/**
 * Walks up from process.cwd() looking for the monorepo root (identified by
 * pnpm-workspace.yaml). Returns null if not found — the caller should treat
 * that as "no mini-apps installed" rather than crashing.
 */
async function findMonorepoRoot(): Promise<string | null> {
  let dir = process.cwd();
  // Cap the walk at 6 levels — deep enough for any realistic monorepo,
  // shallow enough to fail fast if we're being run from somewhere weird.
  for (let i = 0; i < 6; i += 1) {
    try {
      await fs.access(path.join(dir, 'pnpm-workspace.yaml'));
      return dir;
    } catch {
      // fallthrough
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Extracts the `defineMiniApp({...})` argument from a manifest.ts source
 * string and parses it as JavaScript. We use `new Function` rather than
 * JSON.parse because the source uses JS object-literal syntax (unquoted
 * keys, single quotes, trailing commas) — which JSON rejects. This is safe
 * because the input is source code we've authored, not user input.
 */
function extractManifestObject(source: string): unknown {
  // Grab everything between `defineMiniApp(` and the matching `)`. Simple
  // paren-depth counter to survive nested braces + parens inside strings.
  const marker = 'defineMiniApp(';
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error("no defineMiniApp(...) call found");
  }
  let depth = 0;
  let end = -1;
  for (let i = start + marker.length; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      if (depth === 0) {
        end = i;
        break;
      }
      depth -= 1;
    }
  }
  if (end === -1) {
    throw new Error('unbalanced parentheses in defineMiniApp call');
  }
  const literal = source.slice(start + marker.length, end).trim();
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(`return (${literal});`);
  return fn();
}

function validateManifest(raw: unknown, sourcePath: string): MiniAppManifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`manifest is not an object (${sourcePath})`);
  }
  const m = raw as Record<string, unknown>;
  const slug = m.slug;
  const name = m.name;
  const icon = m.icon;
  const route = m.route;
  if (typeof slug !== 'string' || !/^[a-z][a-z0-9-]*$/.test(slug)) {
    throw new Error(`manifest.slug must be lowercase kebab-case (${sourcePath})`);
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`manifest.name must be a non-empty string (${sourcePath})`);
  }
  if (typeof icon !== 'string' || icon.length === 0) {
    throw new Error(`manifest.icon must be a non-empty string (${sourcePath})`);
  }
  if (typeof route !== 'string' || !route.startsWith('/app/')) {
    throw new Error(`manifest.route must start with /app/ (${sourcePath})`);
  }
  const description = typeof m.description === 'string' ? m.description : undefined;
  // defineMiniApp() defaults requiresSubscription to true — mirror that here
  // so the registry sees the same value the mini-app itself does.
  const requiresSubscription =
    typeof m.requiresSubscription === 'boolean' ? m.requiresSubscription : true;
  return { slug, name, icon, route, description, requiresSubscription };
}

async function scanOnce(): Promise<MiniAppManifest[]> {
  const root = await findMonorepoRoot();
  if (!root) {
    console.warn('[mini-apps/registry] monorepo root not found — no mini-apps loaded');
    return [];
  }
  const miniAppsDir = path.join(root, 'apps', 'mini-apps');

  let slugs: string[];
  try {
    const entries = await fs.readdir(miniAppsDir, { withFileTypes: true });
    slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    // No apps/mini-apps directory yet — that's fine, launcher will render
    // its empty state.
    return [];
  }

  const results: MiniAppManifest[] = [];
  for (const slug of slugs) {
    const manifestPath = path.join(miniAppsDir, slug, 'manifest.ts');
    try {
      const source = await fs.readFile(manifestPath, 'utf8');
      const raw = extractManifestObject(source);
      const manifest = validateManifest(raw, manifestPath);
      // Directory name should match the manifest slug — surface the mismatch
      // early so silent duplicates never happen.
      if (manifest.slug !== slug) {
        console.warn(
          `[mini-apps/registry] slug mismatch in ${manifestPath}: directory "${slug}" vs manifest "${manifest.slug}" — using manifest value`,
        );
      }
      results.push(manifest);
    } catch (err) {
      console.error(
        `[mini-apps/registry] failed to load ${manifestPath}:`,
        err instanceof Error ? err.message : err,
      );
      // Swallow — one broken manifest must not break the launcher for the
      // other mini-apps.
    }
  }
  // Stable order by slug so the tile order is deterministic across renders.
  results.sort((a, b) => a.slug.localeCompare(b.slug));
  return results;
}

/**
 * Returns every installed mini-app's manifest. Callable from Server
 * Components and Route Handlers only — uses `node:fs`.
 */
export async function loadInstalledMiniApps(): Promise<MiniAppManifest[]> {
  if (process.env.NODE_ENV === 'production' && cachedRegistry) {
    return cachedRegistry;
  }
  const registry = await scanOnce();
  if (process.env.NODE_ENV === 'production') {
    cachedRegistry = registry;
  }
  return registry;
}
