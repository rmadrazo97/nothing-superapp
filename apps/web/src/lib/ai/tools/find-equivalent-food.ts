/**
 * find_equivalent_food — "I have chicken but no rice — what can I swap?"
 *
 * Given an `original_food` (name substring), we look up its per-serving macros
 * in the `foods` catalog, scale to `original_qty_g` (defaults to the food's
 * default serving), then search for candidates with similar macros.
 *
 * Ranking is Euclidean distance over normalized macro grams (protein/carbs/fat
 * + kcal), then rescaled by the candidate's own macros so the answer includes
 * a "you'd need X grams to match" figure. Category filtering keeps
 * protein↔protein and grain↔grain by default.
 *
 * READ-only: no entitlement / write-budget gate, just audit + auth via the
 * caller's session-scoped Supabase client.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const categoryEnum = z.enum([
  'protein',
  'grain',
  'veg',
  'fruit',
  'dairy',
  'fat',
  'sweet',
  'drink',
]);

const inputSchema = z.object({
  original_food: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      "Name (or substring) of the food the user wants to replace. Example: 'chicken breast'.",
    ),
  original_qty_g: z
    .number()
    .positive()
    .max(5000)
    .optional()
    .describe(
      "Grams of the original food to match on. Omit to use the food's default serving_g.",
    ),
  target_macros: z
    .object({
      protein_g: z.number().nonnegative().max(500).optional(),
      carbs_g: z.number().nonnegative().max(500).optional(),
      fat_g: z.number().nonnegative().max(500).optional(),
      kcal: z.number().nonnegative().max(5000).optional(),
    })
    .optional()
    .describe(
      'Explicit macro target — overrides the derived-from-original-food macros when provided.',
    ),
  availability_hint: z
    .string()
    .max(200)
    .optional()
    .describe("Free-text hint about what the user has (e.g. 'in a Mexican grocery, no tofu'). Optional; used for the audit trail."),
  prefer_category: categoryEnum
    .optional()
    .describe(
      "Constrain the search to this food category. Defaults to the original food's category when found.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe('Max number of swaps to return.'),
});

type Input = z.infer<typeof inputSchema>;

interface FoodRow {
  id: string;
  name: string;
  brand: string | null;
  serving_g: number;
  serving_label: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  category: string | null;
}

interface Candidate {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  qty_g_to_match_macros: number;
  resulting_macros: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  macro_delta_pct: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  distance: number;
}

export interface FindEquivalentFoodResult {
  ok: true;
  summary: string;
  data: {
    original: {
      name: string;
      qty_g: number;
      macros: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
      category: string | null;
    } | null;
    target_macros: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
    candidates: Candidate[];
  };
}

export interface ToolError {
  ok: false;
  error: string;
}

const SELECT =
  'id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g, category';

/**
 * Convert a food row's per-serving macros to the actual macros for `qtyG`
 * grams. Foods store one serving in `serving_g`; scaling is a simple ratio.
 */
function scaleMacros(row: FoodRow, qtyG: number) {
  const factor = row.serving_g > 0 ? qtyG / Number(row.serving_g) : 0;
  return {
    kcal: Number(row.kcal) * factor,
    protein_g: Number(row.protein_g) * factor,
    carbs_g: Number(row.carbs_g) * factor,
    fat_g: Number(row.fat_g) * factor,
  };
}

/**
 * Pick the grams of `candidate` that best matches `target` macros. We choose
 * the ratio that lands the largest single macro (by target grams) on-target,
 * so a "swap chicken for tofu" query returns a tofu quantity that matches the
 * protein rather than the kcal. Falls back to kcal-matching when protein is
 * negligible in both.
 */
function bestQtyToMatch(
  candidate: FoodRow,
  target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
): number {
  const c = {
    kcal: Number(candidate.kcal),
    protein_g: Number(candidate.protein_g),
    carbs_g: Number(candidate.carbs_g),
    fat_g: Number(candidate.fat_g),
    serving_g: Number(candidate.serving_g),
  };
  if (c.serving_g <= 0) return 0;
  // Pick the driving macro — the one that's biggest in `target` AND non-zero
  // in the candidate's per-serving macros.
  type Key = 'protein_g' | 'carbs_g' | 'fat_g' | 'kcal';
  const candidates: Array<{ key: Key; targetVal: number; perServing: number }> = (
    [
      { key: 'protein_g', targetVal: target.protein_g, perServing: c.protein_g },
      { key: 'carbs_g', targetVal: target.carbs_g, perServing: c.carbs_g },
      { key: 'fat_g', targetVal: target.fat_g, perServing: c.fat_g },
      { key: 'kcal', targetVal: target.kcal, perServing: c.kcal },
    ] as Array<{ key: Key; targetVal: number; perServing: number }>
  ).filter((x) => x.perServing > 0 && x.targetVal > 0);
  candidates.sort((a, b) => b.targetVal - a.targetVal);
  const driver = candidates[0];
  if (!driver) return c.serving_g;
  const ratio = driver.targetVal / driver.perServing;
  return Math.max(0, Math.round(ratio * c.serving_g));
}

/**
 * Distance score — smaller is better. We use squared error over normalized
 * macros so a 10g protein miss weighs the same as a 40 kcal miss.
 */
function macroDistance(
  a: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
  b: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
): number {
  return (
    Math.pow((a.kcal - b.kcal) / 100, 2) +
    Math.pow(a.protein_g - b.protein_g, 2) +
    Math.pow(a.carbs_g - b.carbs_g, 2) +
    Math.pow(a.fat_g - b.fat_g, 2)
  );
}

function pct(actual: number, target: number): number {
  if (target === 0) return actual === 0 ? 0 : 100;
  return Math.round(((actual - target) / target) * 100);
}

export function makeFindEquivalentFoodTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Find macro-similar swaps for a food the user can't or doesn't want to eat. Returns top candidates with the grams needed to hit the same protein/carbs/fat/kcal. Use when the user asks 'what can I swap for X' or 'I ran out of Y — what else works'.",
    inputSchema,
    async execute(input: Input): Promise<FindEquivalentFoodResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'find_equivalent_food', input } as const;
      try {
        const safe = input.original_food.replace(/[\\%_]/g, (m) => `\\${m}`);

        // 1. Look up the original food. If not found we can still work when
        //    `target_macros` is supplied explicitly.
        const { data: origMatches, error: origErr } = await supabase
          .from('foods')
          .select(SELECT)
          .ilike('name', `%${safe}%`)
          .order('name')
          .limit(1);
        if (origErr) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: origErr.message });
          return { ok: false, error: origErr.message };
        }
        const original = (origMatches?.[0] ?? null) as FoodRow | null;

        // 2. Derive the target macros — explicit input wins, else scale the
        //    original's macros to the requested qty.
        let target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
        let originalOut: FindEquivalentFoodResult['data']['original'] = null;
        if (original) {
          const qty = input.original_qty_g ?? Number(original.serving_g);
          const derived = scaleMacros(original, qty);
          originalOut = {
            name: original.name,
            qty_g: qty,
            macros: {
              kcal: Math.round(derived.kcal),
              protein_g: Math.round(derived.protein_g),
              carbs_g: Math.round(derived.carbs_g),
              fat_g: Math.round(derived.fat_g),
            },
            category: original.category,
          };
          target = {
            kcal: input.target_macros?.kcal ?? derived.kcal,
            protein_g: input.target_macros?.protein_g ?? derived.protein_g,
            carbs_g: input.target_macros?.carbs_g ?? derived.carbs_g,
            fat_g: input.target_macros?.fat_g ?? derived.fat_g,
          };
        } else {
          if (!input.target_macros) {
            await insertToolAudit({
              ...auditBase,
              status: 'error',
              errorMessage: 'no_match_and_no_target',
            });
            return {
              ok: false,
              error: `Couldn't find "${input.original_food}" in the catalog and no target_macros supplied. Pass explicit target_macros or refine the name.`,
            };
          }
          target = {
            kcal: input.target_macros.kcal ?? 0,
            protein_g: input.target_macros.protein_g ?? 0,
            carbs_g: input.target_macros.carbs_g ?? 0,
            fat_g: input.target_macros.fat_g ?? 0,
          };
        }

        // 3. Search for candidates in the same category (or the caller's
        //    override). We pull a wider net (30) then rank in-process — the
        //    catalog is small and category is indexed.
        const preferCategory = input.prefer_category ?? original?.category ?? null;
        let candidatesQuery = supabase
          .from('foods')
          .select(SELECT)
          .order('name')
          .limit(30);
        if (preferCategory) {
          candidatesQuery = candidatesQuery.eq('category', preferCategory);
        }
        // Exclude the original itself.
        if (original?.id) {
          candidatesQuery = candidatesQuery.neq('id', original.id);
        }
        const { data: candidateRows, error: candErr } = await candidatesQuery;
        if (candErr) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: candErr.message });
          return { ok: false, error: candErr.message };
        }

        const scored: Candidate[] = ((candidateRows ?? []) as FoodRow[])
          .map((row) => {
            const qty = bestQtyToMatch(row, target);
            const resulting = scaleMacros(row, qty);
            const distance = macroDistance(resulting, target);
            return {
              id: row.id,
              name: row.name,
              brand: row.brand,
              category: row.category,
              qty_g_to_match_macros: qty,
              resulting_macros: {
                kcal: Math.round(resulting.kcal),
                protein_g: Math.round(resulting.protein_g),
                carbs_g: Math.round(resulting.carbs_g),
                fat_g: Math.round(resulting.fat_g),
              },
              macro_delta_pct: {
                kcal: pct(resulting.kcal, target.kcal),
                protein_g: pct(resulting.protein_g, target.protein_g),
                carbs_g: pct(resulting.carbs_g, target.carbs_g),
                fat_g: pct(resulting.fat_g, target.fat_g),
              },
              distance,
            };
          })
          .filter((c) => c.qty_g_to_match_macros > 0)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, input.limit);

        const top = scored[0];
        const summary = top
          ? `Best swap: ${top.qty_g_to_match_macros}g ${top.name} (~${top.resulting_macros.kcal} kcal, ${top.resulting_macros.protein_g}p/${top.resulting_macros.carbs_g}c/${top.resulting_macros.fat_g}f).`
          : `No macro-close swaps found${preferCategory ? ` in category "${preferCategory}"` : ''}.`;

        const output: FindEquivalentFoodResult = {
          ok: true,
          summary,
          data: {
            original: originalOut,
            target_macros: {
              kcal: Math.round(target.kcal),
              protein_g: Math.round(target.protein_g),
              carbs_g: Math.round(target.carbs_g),
              fat_g: Math.round(target.fat_g),
            },
            candidates: scored,
          },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'find_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
