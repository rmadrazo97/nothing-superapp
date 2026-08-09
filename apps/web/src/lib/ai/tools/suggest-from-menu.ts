/**
 * suggest_from_menu — "decode a restaurant menu against my remaining macros".
 *
 * Caller passes an array of menu items (name, optional kcal, optional notes).
 * We fill in missing macros by fuzzy-matching each name against the `foods`
 * catalog, then rank items by fit against the user's remaining budget:
 *   1. Under-budget kcal preferred (over-budget items penalized, not excluded)
 *   2. Protein-forward preferred when the user's protein-remaining is high
 *   3. Fiber bonus when there's headroom on carbs
 *
 * If the caller omits `remaining_kcal/macros`, we read the day's totals from
 * the `calorie_daily_totals` VIEW + the user's preferences to derive them.
 *
 * READ-only: no write-budget gate.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const inputSchema = z.object({
  menu_items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        kcal: z.number().nonnegative().max(5000).optional(),
        notes: z.string().max(300).optional(),
      }),
    )
    .min(1)
    .max(30)
    .describe('The restaurant / cafeteria menu. Include the kcal number when it appears on the menu.'),
  remaining_kcal: z
    .number()
    .nonnegative()
    .max(10_000)
    .optional()
    .describe("User's remaining kcal for the day. Omit to auto-compute from today's totals + goal."),
  remaining_macros: z
    .object({
      protein_g: z.number().nonnegative().max(500).optional(),
      carbs_g: z.number().nonnegative().max(500).optional(),
      fat_g: z.number().nonnegative().max(500).optional(),
    })
    .optional()
    .describe("User's remaining macros for the day. Omit to auto-compute."),
  meal_slot: z
    .enum(['breakfast', 'lunch', 'dinner', 'snacks'])
    .optional()
    .describe('Which slot this menu is for — used for the reply summary only.'),
  count: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe('How many suggestions to return (default 3).'),
});

type Input = z.infer<typeof inputSchema>;

interface FoodEstimate {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  matched_food: string | null;
  source: 'menu' | 'foods_match' | 'heuristic';
}

interface Ranked {
  name: string;
  estimated_kcal: number;
  estimated_macros: {
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  matched_food: string | null;
  source: 'menu' | 'foods_match' | 'heuristic';
  why_fits: string;
  score: number;
}

export interface SuggestFromMenuResult {
  ok: true;
  summary: string;
  data: {
    remaining: {
      kcal: number | null;
      protein_g: number | null;
      carbs_g: number | null;
      fat_g: number | null;
    };
    suggestions: Ranked[];
  };
}

export interface ToolError {
  ok: false;
  error: string;
}

interface FoodRow {
  name: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Very small heuristic estimator for menu items we can't match to `foods`.
 * Aim: get within ± 30% so the LLM can still rank, then caveat in the reply.
 */
function heuristicKcal(name: string): number {
  const lower = name.toLowerCase();
  if (/salad(?!.*chicken)/.test(lower)) return 350;
  if (/soup/.test(lower)) return 300;
  if (/bowl|burrito|wrap/.test(lower)) return 700;
  if (/sandwich|panini/.test(lower)) return 550;
  if (/pizza/.test(lower)) return 800;
  if (/burger/.test(lower)) return 750;
  if (/pasta|noodle/.test(lower)) return 650;
  if (/steak|chicken|fish|salmon|tuna/.test(lower)) return 500;
  if (/dessert|cake|ice cream|brownie/.test(lower)) return 450;
  return 500;
}

/**
 * Try to find a `foods` row whose name shares meaningful tokens with the menu
 * item. Tokens 4+ chars only so "the" / "and" don't dominate.
 */
async function fuzzyMatch(
  supabase: SupabaseClient,
  name: string,
): Promise<FoodRow | null> {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return null;
  // Try the two longest tokens; most useful signal.
  tokens.sort((a, b) => b.length - a.length);
  for (const t of tokens.slice(0, 2)) {
    const safe = t.replace(/[\\%_]/g, (m) => `\\${m}`);
    const { data } = await supabase
      .from('foods')
      .select('name, serving_g, kcal, protein_g, carbs_g, fat_g')
      .ilike('name', `%${safe}%`)
      .limit(1);
    const row = (data ?? [])[0] as FoodRow | undefined;
    if (row) return row;
  }
  return null;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function makeSuggestFromMenuTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Rank menu items by fit against the user's remaining daily macros. Handles menus with or without kcal numbers — fuzzy-matches names against the foods catalog and falls back to a heuristic. Use for 'what should I order' / 'help me pick from this menu' questions.",
    inputSchema,
    async execute(input: Input): Promise<SuggestFromMenuResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'suggest_from_menu', input } as const;
      try {
        // 1. Derive remaining budget when not passed in.
        let remainingKcal = input.remaining_kcal ?? null;
        let remainingProtein = input.remaining_macros?.protein_g ?? null;
        let remainingCarbs = input.remaining_macros?.carbs_g ?? null;
        let remainingFat = input.remaining_macros?.fat_g ?? null;
        if (
          remainingKcal == null ||
          remainingProtein == null ||
          remainingCarbs == null ||
          remainingFat == null
        ) {
          const day = todayUtc();
          const [totalsRes, prefsRes] = await Promise.all([
            supabase
              .from('calorie_daily_totals')
              .select('total_kcal, total_protein_g, total_carbs_g, total_fat_g')
              .eq('user_id', userId)
              .eq('day', day)
              .maybeSingle(),
            supabase
              .from('preferences')
              .select('daily_calorie_goal, protein_target_g, carbs_target_g, fat_target_g')
              .eq('user_id', userId)
              .maybeSingle(),
          ]);
          const t = (totalsRes.data ?? {}) as Record<string, number | null>;
          const p = (prefsRes.data ?? {}) as Record<string, number | null>;
          const kcalGoal = p.daily_calorie_goal ?? null;
          const proteinGoal = p.protein_target_g ?? null;
          const carbsGoal = p.carbs_target_g ?? null;
          const fatGoal = p.fat_target_g ?? null;
          if (remainingKcal == null && kcalGoal != null)
            remainingKcal = Math.max(0, Number(kcalGoal) - Number(t.total_kcal ?? 0));
          if (remainingProtein == null && proteinGoal != null)
            remainingProtein = Math.max(0, Number(proteinGoal) - Number(t.total_protein_g ?? 0));
          if (remainingCarbs == null && carbsGoal != null)
            remainingCarbs = Math.max(0, Number(carbsGoal) - Number(t.total_carbs_g ?? 0));
          if (remainingFat == null && fatGoal != null)
            remainingFat = Math.max(0, Number(fatGoal) - Number(t.total_fat_g ?? 0));
        }

        // 2. Enrich every menu item with an estimate.
        const estimates: Array<{ name: string; est: FoodEstimate; notes?: string }> = [];
        for (const item of input.menu_items) {
          let est: FoodEstimate;
          if (item.kcal != null) {
            // Menu supplied kcal — still try to enrich macros via foods match.
            const match = await fuzzyMatch(supabase, item.name);
            if (match && Number(match.kcal) > 0) {
              const ratio = item.kcal / Number(match.kcal);
              est = {
                kcal: item.kcal,
                protein_g: Number(match.protein_g) * ratio,
                carbs_g: Number(match.carbs_g) * ratio,
                fat_g: Number(match.fat_g) * ratio,
                matched_food: match.name,
                source: 'menu',
              };
            } else {
              // No match — split kcal into a 30/45/25 protein/carbs/fat ratio as
              // a "typical restaurant plate" default. Better than zeros.
              est = {
                kcal: item.kcal,
                protein_g: Math.round((item.kcal * 0.3) / 4),
                carbs_g: Math.round((item.kcal * 0.45) / 4),
                fat_g: Math.round((item.kcal * 0.25) / 9),
                matched_food: null,
                source: 'menu',
              };
            }
          } else {
            const match = await fuzzyMatch(supabase, item.name);
            if (match) {
              const kcal = Number(match.kcal);
              est = {
                kcal,
                protein_g: Number(match.protein_g),
                carbs_g: Number(match.carbs_g),
                fat_g: Number(match.fat_g),
                matched_food: match.name,
                source: 'foods_match',
              };
            } else {
              const kcal = heuristicKcal(item.name);
              est = {
                kcal,
                protein_g: Math.round((kcal * 0.3) / 4),
                carbs_g: Math.round((kcal * 0.45) / 4),
                fat_g: Math.round((kcal * 0.25) / 9),
                matched_food: null,
                source: 'heuristic',
              };
            }
          }
          estimates.push({ name: item.name, est, notes: item.notes });
        }

        // 3. Rank. Lower score = better fit.
        const ranked: Ranked[] = estimates.map(({ name, est }) => {
          let score = 0;
          const reasons: string[] = [];
          if (remainingKcal != null) {
            const delta = est.kcal - remainingKcal;
            if (delta <= 0) {
              // Under budget — closer to remaining is better (we reward using
              // the budget, not just being tiny).
              score += Math.abs(delta) * 0.5;
              reasons.push(`${Math.round(remainingKcal - est.kcal)} kcal under budget`);
            } else {
              // Over budget — heavy penalty scaled by how far over.
              score += delta * 2;
              reasons.push(`${Math.round(delta)} kcal OVER budget`);
            }
          } else {
            reasons.push(`~${Math.round(est.kcal)} kcal`);
          }
          if (remainingProtein != null && remainingProtein > 20) {
            // User is protein-short — reward protein-dense options.
            const bonus = Math.min(est.protein_g, remainingProtein) * 4;
            score -= bonus;
            if (est.protein_g >= 20) reasons.push(`${Math.round(est.protein_g)}g protein`);
          }
          if (remainingCarbs != null && remainingCarbs > 30) {
            // Room for carbs → mild fiber bonus (proxied by carbs since our
            // input doesn't carry fiber separately; matched_food carbs is a
            // reasonable stand-in).
            score -= Math.min(est.carbs_g, remainingCarbs) * 0.5;
          }
          return {
            name,
            estimated_kcal: Math.round(est.kcal),
            estimated_macros: {
              protein_g: Math.round(est.protein_g),
              carbs_g: Math.round(est.carbs_g),
              fat_g: Math.round(est.fat_g),
            },
            matched_food: est.matched_food,
            source: est.source,
            why_fits: reasons.join(' · '),
            score,
          };
        });
        ranked.sort((a, b) => a.score - b.score);
        const top = ranked.slice(0, input.count);

        const summary = top[0]
          ? `Best fit${input.meal_slot ? ` for ${input.meal_slot}` : ''}: ${top[0].name} (~${top[0].estimated_kcal} kcal).`
          : 'No suggestions ranked.';

        const output: SuggestFromMenuResult = {
          ok: true,
          summary,
          data: {
            remaining: {
              kcal: remainingKcal,
              protein_g: remainingProtein,
              carbs_g: remainingCarbs,
              fat_g: remainingFat,
            },
            suggestions: top,
          },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'suggest_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
