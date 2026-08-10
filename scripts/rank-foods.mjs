#!/usr/bin/env node
/**
 * scripts/rank-foods.mjs — food-search ranking backfill (v0.5.3 · #97).
 *
 * Applies the canonical whitelist + demotion patterns to the `foods` table.
 * Migration 023 already added the columns (`rank_penalty`, `is_canonical`)
 * and applied a SQL-only baseline; this script re-applies the SQL baseline
 * for idempotency and then layers the JSON-driven canonical whitelist.
 *
 * Idempotent — safe to re-run after adding new rows to the JSON. It never
 * lowers an existing rank_penalty (uses `greatest()`), and canonical flag
 * flip is a set-to-true (no reset).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/rank-foods.mjs
 *
 * Local dev tip: source `apps/web/.env.local` first —
 *   set -a && . apps/web/.env.local && set +a && node scripts/rank-foods.mjs
 *
 * The script uses the service-role client (bypasses RLS) — necessary because
 * the `foods` table has no writer policy for the `authenticated` role. Never
 * ship this script into a Vercel bundle or client-side context.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const CANONICAL_JSON_PATH = resolve(
  REPO_ROOT,
  'packages/shared/canonical-foods.json',
);

// ── Env + client ────────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'rank-foods: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Source apps/web/.env.local before running.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Pattern-based demotion — mirrors migration 023, re-run defensively ─────

/**
 * `matches` = ILIKE patterns; `weight` = penalty applied via greatest().
 * Keep in sync with migration 023 so a fresh DB gets identical ranking even
 * when the script hasn't run yet.
 */
const DEMOTION_RULES = [
  {
    label: 'babyfood/strained/junior/frozen-unprepared',
    weight: 200,
    matches: [
      'Babyfood,%',
      '%, strained%',
      '%, junior%',
      '%, frozen, unprepared%',
    ],
  },
  {
    label: 'alcoholic-with-brand',
    weight: 150,
    // Alcoholic beverage rows with 4+ commas → the brand is in the string.
    // We approximate the SQL regex here with a JS post-filter after ILIKE.
    matches: ['Alcoholic beverage,%'],
    postFilter: (name) => (name.match(/,/g) || []).length >= 4,
  },
  {
    label: 'fast-food-chain',
    weight: 150,
    matches: ['Fast foods,%'],
  },
  {
    label: 'agutuk',
    weight: 150,
    matches: ['Agutuk,%'],
  },
];

async function applyDemotions() {
  let totalUpdated = 0;
  for (const rule of DEMOTION_RULES) {
    // Fetch matching ids up-front so we can `greatest()` in JS (Supabase's
    // JS client doesn't expose greatest() as a callable expression). Cheap
    // — `foods` is <5k rows.
    let matches = [];
    for (const pattern of rule.matches) {
      const { data, error } = await supabase
        .from('foods')
        .select('id, name, rank_penalty')
        .ilike('name', pattern);
      if (error) {
        console.error(`rank-foods: fetch failed for ${pattern}:`, error.message);
        continue;
      }
      matches.push(...(data ?? []));
    }
    // De-dupe by id.
    const byId = new Map();
    for (const row of matches) byId.set(row.id, row);
    matches = [...byId.values()];

    // Optional post-filter (e.g. alcoholic-with-brand comma count).
    if (rule.postFilter) {
      matches = matches.filter((row) => rule.postFilter(row.name));
    }

    let updated = 0;
    for (const row of matches) {
      const existing = row.rank_penalty ?? 0;
      const next = Math.max(existing, rule.weight);
      if (next === existing) continue;
      const { error: uerr } = await supabase
        .from('foods')
        .update({ rank_penalty: next })
        .eq('id', row.id);
      if (uerr) {
        console.error(`rank-foods: update failed for ${row.id}:`, uerr.message);
        continue;
      }
      updated += 1;
    }
    totalUpdated += updated;
    console.log(
      `  · ${rule.label.padEnd(38)} ${matches.length.toString().padStart(4)} matched, ${updated} bumped`,
    );
  }
  return totalUpdated;
}

// ── Canonical whitelist — the "if you type X, we want Y" seed ─────────────

async function applyCanonical() {
  const raw = readFileSync(CANONICAL_JSON_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const entries = parsed.entries ?? [];

  console.log(`  · reading ${entries.length} canonical entries from JSON`);

  // Group by name_pattern so we hit each pattern once even if multiple
  // queries point at it (e.g. "chicken breast" + "chicken" share the row).
  const patternMap = new Map(); // name_pattern → Set<query>
  for (const e of entries) {
    if (!e.name_pattern) continue;
    const bag = patternMap.get(e.name_pattern) ?? new Set();
    bag.add(e.query);
    patternMap.set(e.name_pattern, bag);
  }

  let flagged = 0;
  let missing = 0;
  for (const [pattern, queries] of patternMap) {
    // Exact case-insensitive match on the full row name — we deliberately
    // do NOT ILIKE with wildcards here so a canonical entry marks only the
    // one row we mean, not every "Sweet potato, *" variant.
    const { data, error } = await supabase
      .from('foods')
      .select('id, name')
      .ilike('name', pattern);
    if (error) {
      console.error(`rank-foods: canonical fetch failed for ${pattern}:`, error.message);
      continue;
    }
    if (!data || data.length === 0) {
      missing += 1;
      // Not an error — the row may not be seeded in this DB yet.
      continue;
    }
    for (const row of data) {
      const { error: uerr } = await supabase
        .from('foods')
        .update({ is_canonical: true, rank_penalty: 0 })
        .eq('id', row.id);
      if (uerr) {
        console.error(`rank-foods: canonical update failed for ${row.id}:`, uerr.message);
        continue;
      }
      flagged += 1;
    }
  }
  console.log(
    `  · ${flagged} canonical rows flagged; ${missing} patterns had no matching row (skipped)`,
  );
  return { flagged, missing };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('rank-foods: applying demotion patterns');
  const demoted = await applyDemotions();
  console.log(`rank-foods: demotion pass done — ${demoted} rows adjusted\n`);

  console.log('rank-foods: applying canonical whitelist');
  const { flagged, missing } = await applyCanonical();
  console.log(`rank-foods: canonical pass done — flagged=${flagged}, missing=${missing}\n`);

  console.log('rank-foods: complete.');
}

main().catch((err) => {
  console.error('rank-foods: fatal error:', err);
  process.exit(1);
});
