/**
 * resolveIngredient — server-side helper for turning a free-text ingredient
 * name (Spanish or English) into a canonical `foods` row so log_meal
 * ingredients that arrive without a `food_id` still land with real macros.
 *
 * v0.5.1 shipped alongside migration 018 (`food_aliases` + trigram index).
 * The resolver runs in three passes:
 *
 *   1) Exact alias hit (lower(alias) = lower(input)) — deterministic,
 *      handles the Diet Jam v1 planner ingredients seeded in the migration.
 *   2) Trigram-similarity alias hit (`similarity(...) > 0.4`) — catches
 *      typos + minor variations ("aguacates" vs "aguacate").
 *   3) Trigram-similarity foods.name hit (`similarity(lower(name), $1) > 0.3`)
 *      — the last-resort English fuzzy lookup for anything not in the
 *      curated alias set.
 *
 * All three passes are cheap PostGIS-style GIN lookups; total budget on
 * a resolved-in-pass-1 hit is well under 5ms in prod.
 *
 * Returns null when nothing matches — caller decides whether to leave the
 * entry at kcal=0 (with a "NO MACROS" tag), enqueue a copilot follow-up,
 * or drop the row.
 *
 * Deliberately typed against `SupabaseClient` from `@supabase/supabase-js`
 * (not our project-specific `createClient()`) so both the RLS-aware
 * per-user client and the service-role client can call it — the
 * `foods` + `food_aliases` tables are public-readable so either works.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type ResolvedFood = {
  id: string;
  name: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  cholesterol_mg: number;
  /**
   * Which resolution strategy fired. Useful for logging + eventual quality
   * metrics ("of every 100 plan ingredients, how many needed pass 3?").
   */
  match: 'alias_exact' | 'alias_fuzzy' | 'foods_fuzzy';
  /** 0..1 confidence. `alias_exact` = 1; fuzzy passes report the pg similarity score. */
  score: number;
};

const FOOD_COLUMNS =
  'id, name, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg';

/**
 * Normalize input for the exact-alias pass — trims whitespace + lowercases +
 * strips a small set of quantity/parenthetical decorations so
 * "Pechuga de pollo (200 g)" → "pechuga de pollo".
 */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .trim()
    // Drop parenthetical content e.g. "(200 g)" or "(al gusto)".
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    // Collapse repeated whitespace.
    .replace(/\s+/g, ' ')
    .trim();
}

export async function resolveIngredient(
  supabase: SupabaseClient,
  rawInput: string,
): Promise<ResolvedFood | null> {
  const query = normalize(rawInput);
  if (query.length < 2) return null;

  // ── Pass 1: exact alias ────────────────────────────────────────────
  // `.ilike` with no wildcards is an equality on lower(alias). The
  // functional index `food_aliases_alias_lower_idx` handles it in O(log n).
  // Fetch the alias row first, then look up the food by id — avoids the
  // PostgREST-typed foreign-embed ambiguity (returns array vs object
  // depending on relationship metadata).
  {
    const { data, error } = await supabase
      .from('food_aliases')
      .select('food_id')
      .ilike('alias', query)
      .limit(1);
    if (!error && data && data.length > 0) {
      const foodId = (data[0] as { food_id: string }).food_id;
      const food = await fetchFoodById(supabase, foodId);
      if (food) {
        return { ...food, match: 'alias_exact', score: 1 };
      }
    }
  }

  // ── Pass 2: fuzzy alias (trigram similarity) ───────────────────────
  // Uses the `%` operator (backed by `food_aliases_alias_trgm_idx`) plus
  // an explicit similarity threshold so ranking is deterministic.
  {
    const { data, error } = await supabase.rpc('resolve_ingredient_alias_fuzzy', {
      needle: query,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0] as {
        food_id: string;
        similarity: number;
      };
      if (row.food_id && row.similarity >= 0.4) {
        const food = await fetchFoodById(supabase, row.food_id);
        if (food) {
          return { ...food, match: 'alias_fuzzy', score: row.similarity };
        }
      }
    }
    // If the RPC doesn't exist yet (older DB snapshot) we silently skip —
    // pass 3 covers the same ground with slightly lower recall.
  }

  // ── Pass 3: fuzzy `foods.name` (trigram similarity) ────────────────
  {
    const { data, error } = await supabase.rpc('resolve_ingredient_food_fuzzy', {
      needle: query,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0] as {
        id: string;
        similarity: number;
      };
      if (row.id && row.similarity >= 0.3) {
        const food = await fetchFoodById(supabase, row.id);
        if (food) {
          return { ...food, match: 'foods_fuzzy', score: row.similarity };
        }
      }
    }
    // RPC missing → last-chance ILIKE contains search. Not indexed the same
    // way, but fine as a v1 fallback while migrations catch up.
    if (error) {
      const { data: fallback } = await supabase
        .from('foods')
        .select(FOOD_COLUMNS)
        .ilike('name', `%${query}%`)
        .order('kcal', { ascending: false })
        .limit(1);
      if (fallback && fallback.length > 0) {
        return {
          ...(fallback[0] as Omit<ResolvedFood, 'match' | 'score'>),
          match: 'foods_fuzzy',
          score: 0.3,
        };
      }
    }
  }

  return null;
}

async function fetchFoodById(
  supabase: SupabaseClient,
  id: string,
): Promise<Omit<ResolvedFood, 'match' | 'score'> | null> {
  const { data } = await supabase
    .from('foods')
    .select(FOOD_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  return (data as Omit<ResolvedFood, 'match' | 'score'> | null) ?? null;
}
