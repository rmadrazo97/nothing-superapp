#!/usr/bin/env node
/**
 * broadcast-release.mjs — fire the release Web Push broadcast for the
 * current APP_VERSION.
 *
 * Reads `apps/web/src/lib/version.ts` (regex-parsed — no bundler) to pull
 * the version + first two changelog bullets, then POSTs
 * `/api/admin/broadcast` with:
 *
 *   {
 *     topic: 'releases',
 *     version: APP_VERSION,          // dedupes via unique constraint
 *     title: 'Nothing Superapp v{version}',
 *     body:   first two changelog highlights joined with ' · ',
 *     url:   '/app/settings#changelog',
 *   }
 *
 * Auth: prefers `ADMIN_BROADCAST_SECRET` (sent as `X-Admin-Secret`). Falls
 * back to `ADMIN_SESSION_COOKIE` if you want to test as a real admin user
 * (grab from DevTools → Application → Cookies → sb-*-auth-token).
 *
 * Env:
 *   BROADCAST_BASE_URL   Default: https://nothing-superapp.vercel.app
 *   ADMIN_BROADCAST_SECRET   Preferred — service secret
 *   ADMIN_SESSION_COOKIE     Alternative — pasted browser cookie header
 *   YES=1                    Skip the confirm prompt (or pass --yes)
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const versionFile = path.join(repoRoot, 'apps/web/src/lib/version.ts');
const envFile = path.join(repoRoot, 'apps/web/.env.local');

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#') || !s.includes('=')) continue;
    const idx = s.indexOf('=');
    const k = s.slice(0, idx).trim();
    const v = s.slice(idx + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvFile(envFile);

// ── Parse APP_VERSION + latest CHANGELOG entry via regex — cheap enough
// that we don't need a full TS loader. If the shape ever gets clever we
// can bring in ts-node, but for a single-line const + JSON-ish array
// this is honest and stable.
function parseVersion() {
  const src = fs.readFileSync(versionFile, 'utf8');
  const versionMatch = src.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!versionMatch) throw new Error('APP_VERSION not found in version.ts');
  const version = versionMatch[1];

  // Grab everything inside the first `highlights: [ ... ]` block after the
  // version we just matched. The changelog is ordered newest-first, so the
  // first block after the matching version entry is what we want.
  const anchor = src.indexOf(versionMatch[0]);
  const entryStart = src.indexOf(`version: '${version}'`, anchor);
  const highlightsStart = src.indexOf('highlights:', entryStart);
  const openBracket = src.indexOf('[', highlightsStart);
  const closeBracket = src.indexOf(']', openBracket);
  if (openBracket < 0 || closeBracket < 0) {
    throw new Error('Could not locate highlights[] for current version');
  }
  const body = src.slice(openBracket + 1, closeBracket);
  const bullets = [];
  const re = /['"]((?:\\.|[^'"\\])+)['"]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    bullets.push(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
  return { version, bullets };
}

function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

async function confirm(prompt) {
  if (process.env.YES === '1' || process.argv.includes('--yes') || process.argv.includes('-y')) {
    return true;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

async function main() {
  const baseUrl = process.env.BROADCAST_BASE_URL || 'https://nothing-superapp.vercel.app';
  const { version, bullets } = parseVersion();
  const topBullets = bullets.slice(0, 2);
  if (topBullets.length === 0) {
    console.error('No changelog highlights for the current version — nothing to say.');
    process.exit(1);
  }

  const payload = {
    topic: 'releases',
    version,
    title: `Nothing Superapp v${version}`,
    body: truncate(topBullets.join(' · '), 300),
    url: '/app/settings#changelog',
  };

  console.log('Broadcast target :', baseUrl + '/api/admin/broadcast');
  console.log('Version          :', version);
  console.log('Title            :', payload.title);
  console.log('Body             :', payload.body);
  console.log('URL              :', payload.url);
  console.log();

  const ok = await confirm('Send this release broadcast?');
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ADMIN_BROADCAST_SECRET) {
    headers['X-Admin-Secret'] = process.env.ADMIN_BROADCAST_SECRET;
  } else if (process.env.ADMIN_SESSION_COOKIE) {
    headers['Cookie'] = process.env.ADMIN_SESSION_COOKIE;
  } else {
    console.error(
      'No auth configured. Set ADMIN_BROADCAST_SECRET (preferred) or ADMIN_SESSION_COOKIE.',
    );
    process.exit(2);
  }

  const res = await fetch(baseUrl + '/api/admin/broadcast', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (res.status === 409) {
    console.log(`Already sent for v${version}. (dedupe worked)`);
    process.exit(0);
  }
  if (!res.ok) {
    console.error('Broadcast failed:', res.status, json);
    process.exit(3);
  }
  console.log('Broadcast OK:', json);
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
