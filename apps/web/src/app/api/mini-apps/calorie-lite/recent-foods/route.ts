/**
 * GET /api/mini-apps/calorie-lite/recent-foods
 *
 * v3 MFP-tier Wave 2-B: the 10 most-recently-logged distinct foods for the
 * caller, drawn from `app_calorie_entries` over the last 30 days. Rendered
 * as horizontal chips above the search results when the query is empty.
 *
 * "Distinct" is per-target — a public food (food_id) counts once regardless
 * of how many times it was logged; a custom food (custom_food_id) likewise.
 * We keep only the most recent entry per target so a food you logged 12
 * times last week takes ONE recent slot, not 12.
 *
 * Response shape matches `/favorites` for uniform client rendering:
 *   { recent: [{ id, kind: 'public'|'custom', food, created_at }] }
 * where `id` here is the source entry_id (used only as a React key —
 * "recent" rows are not directly mutable).
 *
 * Auth-gated (401) + entitlement-gated (402), mirroring `entries/route.ts`.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FOOD_COLUMNS =
  'id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, category';
const CUSTOM_FOOD_COLUMNS =
  'id, user_id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, created_at';

// 30-day window keeps the recent list feeling recent. 500-row over-fetch cap
// on the entries scan is plenty — even a heavy logger stays well under that
// in a month.
const RECENT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_ENTRY_SCAN_LIMIT = 500;
const RECENT_MAX = 10;

type EntryRow = {
  id: string;
  entered_at: string;
  food_id: string | null;
  custom_food_id: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { entitlement } = await getEntitlement(user.id, supabase);
  if (!isEntitled(entitlement)) {
    return NextResponse.json(
      { error: 'payment_required', entitlement },
      { status: 402 },
    );
  }

  const sinceIso = new Date(Date.now() - RECENT_LOOKBACK_MS).toISOString();

  // Pull raw entry rows (only the columns we need) ordered newest-first, then
  // dedupe in-app. A Postgres `distinct on` would be cleaner but the PostgREST
  // adapter doesn't expose it — the client-side dedupe over ≤500 rows is a
  // rounding-error hit.
  const { data: entryRows, error: entryErr } = await supabase
    .from('app_calorie_entries')
    .select('id, entered_at, food_id, custom_food_id')
    .eq('user_id', user.id)
    .gte('entered_at', sinceIso)
    .order('entered_at', { ascending: false })
    .limit(RECENT_ENTRY_SCAN_LIMIT);

  if (entryErr) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const rows = (entryRows ?? []) as EntryRow[];
  const seen = new Set<string>();
  type RecentSeed = {
    entryId: string;
    kind: 'public' | 'custom';
    targetId: string;
    enteredAt: string;
  };
  const seeds: RecentSeed[] = [];
  for (const r of rows) {
    let key: string | null = null;
    let kind: 'public' | 'custom' | null = null;
    let targetId: string | null = null;
    if (r.food_id) {
      kind = 'public';
      targetId = r.food_id;
      key = `p:${r.food_id}`;
    } else if (r.custom_food_id) {
      kind = 'custom';
      targetId = r.custom_food_id;
      key = `c:${r.custom_food_id}`;
    } else {
      // Quick-log entry with no food pointer — nothing to "recent" against.
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push({ entryId: r.id, kind, targetId, enteredAt: r.entered_at });
    if (seeds.length >= RECENT_MAX) break;
  }

  if (seeds.length === 0) {
    return NextResponse.json({ recent: [] });
  }

  const publicIds = seeds
    .filter((s) => s.kind === 'public')
    .map((s) => s.targetId);
  const customIds = seeds
    .filter((s) => s.kind === 'custom')
    .map((s) => s.targetId);

  const publicMap = new Map<string, Record<string, unknown>>();
  if (publicIds.length > 0) {
    const { data, error } = await supabase
      .from('foods')
      .select(FOOD_COLUMNS)
      .in('id', publicIds);
    if (error) {
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    for (const row of data ?? []) {
      publicMap.set((row as { id: string }).id, row as Record<string, unknown>);
    }
  }

  const customMap = new Map<string, Record<string, unknown>>();
  if (customIds.length > 0) {
    const { data, error } = await supabase
      .from('custom_foods')
      .select(CUSTOM_FOOD_COLUMNS)
      .eq('user_id', user.id)
      .in('id', customIds);
    if (error) {
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    for (const row of data ?? []) {
      customMap.set((row as { id: string }).id, row as Record<string, unknown>);
    }
  }

  // Preserve the newest-first ordering from `seeds`. Drop any seed whose
  // target food no longer exists (a deleted custom food, a pruned public
  // catalog row) — a "recent" pointer to nothing is worse than a shorter
  // list.
  type HydratedRecent = {
    id: string;
    kind: 'public' | 'custom';
    food: Record<string, unknown> & { _source: 'public' | 'custom' };
    created_at: string;
  };
  const recent: HydratedRecent[] = [];
  for (const s of seeds) {
    const src = s.kind === 'public'
      ? publicMap.get(s.targetId)
      : customMap.get(s.targetId);
    if (!src) continue;
    recent.push({
      id: s.entryId,
      kind: s.kind,
      food: { ...src, _source: s.kind },
      created_at: s.enteredAt,
    });
  }

  return NextResponse.json({ recent });
}
