#!/usr/bin/env node
/**
 * build-blueprint.mjs — assemble stack-blueprint.md from a locked answers.json.
 *
 * The agent fills answers.json with the locked decisions (see the schema in the
 * example below), then this script substitutes them into templates/stack-blueprint.md.
 *
 * Usage:
 *   node scripts/build-blueprint.mjs --answers <path/to/answers.json> --out <path/to/stack-blueprint.md>
 *
 * answers.json schema (all fields are strings; multi-line uses \n):
 * {
 *   "PRODUCT_NAME": "...",
 *   "DATE": "2026-08-07",
 *   "PRODUCT_SUMMARY_PARAGRAPH": "...",
 *   "PRIMARY_TARGET": "...",
 *   "SECONDARY_TARGETS": "...",
 *   "BUDGET_TIER": "...",
 *   "TEAM_SIZE": "...",
 *   "URGENCY": "...",
 *   "HARD_RULES": "...",
 *   "FRONTEND": "...", "FRONTEND_ALT": "...",
 *   ... one field per placeholder in templates/stack-blueprint.md ...
 * }
 *
 * The agent can also skip this script and hand-fill the template with the Edit tool.
 * This is a convenience for when the answer set is already structured.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, '..');
const templatePath = join(skillRoot, 'templates', 'stack-blueprint.md.txt');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) {
      const k = cur.slice(2);
      const v = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
      acc.push([k, v]);
    }
    return acc;
  }, [])
);

if (!args.answers || !args.out) {
  console.error('usage: build-blueprint.mjs --answers <answers.json> --out <stack-blueprint.md>');
  process.exit(2);
}

const substitute = (str, vars) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), str);

const answers = JSON.parse(await readFile(args.answers, 'utf8'));
const template = await readFile(templatePath, 'utf8');
const blueprint = substitute(template, answers);

// Sanity: warn on unfilled placeholders
const unfilled = [...blueprint.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]);
if (unfilled.length > 0) {
  console.warn(`WARN: ${unfilled.length} unfilled placeholder(s): ${[...new Set(unfilled)].join(', ')}`);
}

await mkdir(dirname(resolve(args.out)), { recursive: true });
await writeFile(args.out, blueprint);
console.log(`Wrote ${args.out}`);
