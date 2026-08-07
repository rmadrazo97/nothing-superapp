/**
 * Load apps/web/.env.local into `process.env` before the test suite starts.
 *
 * Next.js loads this file itself for the dev server (which Playwright spawns
 * via `webServer`), but the Playwright worker processes don't get it —
 * `SUPABASE_SERVICE_ROLE_KEY` and friends need to be visible in the auth
 * helper for `admin.createUser()` to work.
 *
 * We keep it dependency-free (no `dotenv` package) — this parser handles the
 * shape .env.local uses in this repo (KEY=value, no export, no interpolation,
 * no quotes) and nothing else. Add features only when the .env.local grows.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_PATH = resolve(__dirname, '..', '..', '.env.local');

let loaded = false;

export function loadEnvOnce() {
  if (loaded) return;
  loaded = true;

  let raw: string;
  try {
    raw = readFileSync(ENV_PATH, 'utf-8');
  } catch (err) {
    console.warn(`[e2e] could not read ${ENV_PATH}: ${(err as Error).message}`);
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Never clobber an env value that's already set (CI overrides win).
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvOnce();
