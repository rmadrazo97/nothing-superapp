#!/usr/bin/env node
/**
 * validate-reference-routine.mjs — smoke-test the RoutineV2 Zod schema
 * against the coach-authored reference fixture. Exits 0 on pass, 1 on fail.
 *
 * Run once per schema change:
 *   node scripts/validate-reference-routine.mjs
 *
 * Skips a full test runner so this ships without new deps — the fixture
 * itself is committed under apps/mini-apps/gym-routine/fixtures/jam-v1.json
 * and doubles as documentation of the target shape.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const fixturePath = resolve(repoRoot, 'apps/mini-apps/gym-routine/fixtures/jam-v1.json');

// Import the schema module directly by URL. Node can resolve .ts if we ask
// it to via tsx/ts-node — but to stay dep-free we ship a tiny JS shim: we
// use zod (already in packages/shared) and re-implement JUST the top-level
// shape check. If this passes, the .ts schema (which is stricter — union
// discriminants, refined ranges) also passes as long as we mirror the same
// rules. To be safe we shell out to the TS module via `node --experimental-strip-types`
// on modern Node.
async function loadSchemaModule() {
  const modPath = resolve(repoRoot, 'packages/shared/src/schemas/gym.ts');
  const url = pathToFileURL(modPath).href;
  try {
    return await import(url);
  } catch (err) {
    console.error('[validate] cannot import schemas/gym.ts directly.');
    console.error('[validate] Node needs --experimental-strip-types (>=22.6) or run via tsx.');
    console.error(String(err?.message ?? err));
    process.exit(2);
  }
}

const mod = await loadSchemaModule();
const routineV2Schema = mod.routineV2Schema;
if (!routineV2Schema) {
  console.error('[validate] routineV2Schema missing from gym.ts export.');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
const parsed = routineV2Schema.safeParse(raw);

if (!parsed.success) {
  console.error('[validate] FAIL');
  console.error(JSON.stringify(parsed.error.flatten(), null, 2));
  process.exit(1);
}

const p = parsed.data.plan;
console.log('[validate] PASS');
console.log(`  plan.id            ${p.id}`);
console.log(`  plan.days          ${p.days.length}`);
console.log(`  exercises (total)  ${p.days.reduce((n, d) => n + d.exercises.length, 0)}`);
console.log(`  parsing_notes      ${parsed.data.parsing_notes.length}`);
