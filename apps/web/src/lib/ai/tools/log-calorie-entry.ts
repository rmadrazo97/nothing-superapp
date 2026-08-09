/**
 * log_calorie_entry — inserts a row into app_calorie_entries on the
 * caller's behalf. Server-side auth + entitlement + write-budget gates.
 * user_id is ALWAYS the session user — never trusted from tool input.
 *
 * Two ways to log:
 *   1. Pick from a food (food_id OR custom_food_id) + serving_qty/unit +
 *      derived nutrition passed by the LLM. Snapshot approach — matches
 *      the calorie-lite entries route.
 *   2. Ad-hoc entry — just `name` + `kcal` + optional macros. `raw_input`
 *      captures what the user said.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mealEnum } from '@nothing/shared';
import { insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

const inputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe('Human-readable meal label — e.g. "Greek yogurt 150g" or "leftover pizza".'),
  kcal: z.number().int().nonnegative().max(20000).describe('Total kilocalories for this entry.'),
  protein_g: z.number().nonnegative().max(2000).default(0),
  carbs_g: z.number().nonnegative().max(2000).default(0),
  fat_g: z.number().nonnegative().max(2000).default(0),
  fiber_g: z.number().nonnegative().max(2000).default(0).optional(),
  sugar_g: z.number().nonnegative().max(2000).default(0).optional(),
  sodium_mg: z.number().nonnegative().max(100_000).default(0).optional(),
  cholesterol_mg: z.number().nonnegative().max(10_000).default(0).optional(),
  meal_slot: mealEnum.default('snacks').describe('breakfast | lunch | dinner | snacks'),
  food_id: z.string().max(120).nullable().optional().describe('Public foods.id if this came from search_foods with source=public.'),
  custom_food_id: z.string().uuid().nullable().optional().describe('custom_foods.id if source=custom.'),
  serving_qty: z.number().positive().max(10_000).nullable().optional(),
  serving_unit: z.string().max(20).nullable().optional(),
});

type Input = z.infer<typeof inputSchema>;

export interface LogCalorieResult {
  ok: true;
  summary: string;
  data: { entry_id: string; kcal: number };
}
export interface ToolError { ok: false; error: string }

export function makeLogCalorieEntryTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      'Log a food entry to calorie-lite for the current user. Requires kcal + a name. Use search_foods first when the user names a specific food; only fabricate values when the user explicitly gives them.',
    inputSchema,
    async execute(input: Input): Promise<LogCalorieResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'log_calorie_entry', input } as const;

      const budget = assertWriteBudget(userId);
      if (!budget.ok) {
        await insertToolAudit({ ...auditBase, status: 'rate_limited', errorMessage: budget.error });
        return { ok: false, error: budget.error };
      }
      const gate = await assertEntitled(userId, supabase);
      if (!gate.ok) {
        await insertToolAudit({ ...auditBase, status: gate.status, errorMessage: gate.error });
        return { ok: false, error: gate.error };
      }

      try {
        const { data, error } = await supabase
          .from('app_calorie_entries')
          .insert({
            user_id: userId,             // ALWAYS server-side, never trusted
            meal: input.meal_slot,
            kcal: input.kcal,
            raw_input: input.name,
            protein_g: input.protein_g,
            carbs_g: input.carbs_g,
            fat_g: input.fat_g,
            fiber_g: input.fiber_g ?? 0,
            sugar_g: input.sugar_g ?? 0,
            sodium_mg: input.sodium_mg ?? 0,
            cholesterol_mg: input.cholesterol_mg ?? 0,
            food_id: input.food_id ?? null,
            custom_food_id: input.custom_food_id ?? null,
            serving_qty: input.serving_qty ?? null,
            serving_unit: input.serving_unit ?? null,
          })
          .select('id')
          .single();
        if (error || !data) {
          const msg = error?.message ?? 'db_error';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: msg });
          return { ok: false, error: msg };
        }
        const output: LogCalorieResult = {
          ok: true,
          summary: `Logged to Calorie Lite: ${input.name} · ${input.kcal} kcal (${input.meal_slot}).`,
          data: { entry_id: data.id as string, kcal: input.kcal },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'log_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
