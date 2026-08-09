/**
 * create_meal_plan — insert a nutritionist-style structured meal plan for the
 * current user. Same write-gate stack as create_gym_routine (entitlement +
 * hourly write budget) + full audit-log row.
 *
 * The tool's inputSchema is `mealPlanInsertSchema` — the LLM must fill the
 * full nutritionist shape (plan.meals[].options[].ingredients[] with per-meal
 * targets, optional rules block, optional bilingual name pairs).
 */
import { tool } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mealPlanInsertSchema, type MealPlanInsert } from '@nothing/shared';
import { insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

export interface CreateMealPlanResult {
  ok: true;
  summary: string;
  data: {
    meal_plan_id: string;
    name: string;
    meal_count: number;
    option_count: number;
    ingredient_count: number;
  };
}
export interface ToolError { ok: false; error: string }

const DESCRIPTION = [
  'Create a nutritionist-style meal plan for the current user.',
  'Structure: plan.meals[] where each meal has options[]. Each option is a different equivalent way to hit the same per-meal macro target (protein_g, carbs_g, fat_g, calories_kcal).',
  'Ingredients have `quantity` + `unit` ("g" | "ml" | "unit"), OR set `free: true` (with quantity: null, unit: null) for unlimited items like salads / vegetables / tomato slices.',
  'Use `generic: true` for unspecified items like "any fruit 150 g".',
  'Bilingual: prefer both `name_es` and `name_en` when the source is bilingual (e.g. "Pan de masa madre" / "Sourdough bread").',
  'Include `plan.daily_targets` (total for the day), per-meal `targets` (each option should hit these), and optional `plan.rules` — weighing {state:raw|cooked|either}, free_meal {per_week}, hydration {min_water_litres}, vegetables {applies_to,unlimited,optional,fallback}, option_interchangeability {across_meals}, protein_source_swap {allowed,scope}.',
  'Meal `id` is a free-form slug (e.g. "desayuno", "comida", "cena", "snack1") — do NOT force the four MFP slots; the app maps the plan slug to a slot internally.',
  'Do NOT set `id`, `user_id`, `created_at`, `updated_at`, `plan.id` unless the source provides plan.id.',
].join(' ');

export function makeCreateMealPlanTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description: DESCRIPTION,
    inputSchema: mealPlanInsertSchema,
    async execute(input: MealPlanInsert): Promise<CreateMealPlanResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'create_meal_plan', input } as const;

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

      const rowName =
        input.name?.trim() ||
        input.source?.title?.trim() ||
        input.plan.id?.trim() ||
        'Meal plan';

      try {
        const { data, error } = await supabase
          .from('meal_plans')
          .insert({
            user_id: userId,
            name: rowName,
            schema_version: '1.0',
            plan: input.plan,
            source: input.source ?? null,
            athlete: input.athlete ?? null,
            is_template: input.is_template ?? false,
            parsing_notes: input.parsing_notes ?? [],
          })
          .select('id')
          .single();
        if (error || !data) {
          const msg = error?.message ?? 'db_error';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: msg });
          return { ok: false, error: msg };
        }
        const mealCount = input.plan.meals.length;
        const optionCount = input.plan.meals.reduce((n, m) => n + m.options.length, 0);
        const ingredientCount = input.plan.meals.reduce(
          (n, m) => n + m.options.reduce((k, o) => k + o.ingredients.length, 0),
          0,
        );
        const output: CreateMealPlanResult = {
          ok: true,
          summary: `Created meal plan "${rowName}" — ${mealCount} meals, ${optionCount} options, ${ingredientCount} ingredients.`,
          data: {
            meal_plan_id: data.id as string,
            name: rowName,
            meal_count: mealCount,
            option_count: optionCount,
            ingredient_count: ingredientCount,
          },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'create_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
