/**
 * log_meal_from_plan — one-shot: pick a meal from the user's plan + choose an
 * option, and this tool inserts one app_calorie_entries row per quantified
 * ingredient AND upserts a meal_plan_adherence row. Write-gated + audited.
 *
 * Server-side logic mirrors POST /api/mini-apps/calorie-lite/meal-plans/log-meal
 * (single source of truth) — this tool inlines the DB writes so it doesn't
 * fan out through HTTP but reuses the exact same shape guarantees.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mealEnum,
  mealPlanPlanSchema,
  mealPlanSubstitutionSchema,
  mealSlotIdToMfpSlot,
  type Ingredient,
} from '@nothing/shared';
import { insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

const inputSchema = z
  .object({
    meal_plan_id: z
      .string()
      .uuid()
      .optional()
      .describe("Omit to use the user's active meal plan (preferences.active_meal_plan_id)."),
    meal_id: z
      .string()
      .min(1)
      .max(40)
      .describe('Which meal to log — matches plan.meals[].id, e.g. "desayuno".'),
    option_selected: z
      .number()
      .int()
      .positive()
      .max(50)
      .describe('Which option in that meal — 1-based, matches option.option.'),
    override_slot: mealEnum
      .optional()
      .describe("Force the app_calorie_entries.meal_slot; defaults to the plan meal's mapped slot."),
    override_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Adherence row date; defaults to today.'),
    substitutions: z
      .array(mealPlanSubstitutionSchema)
      .max(30)
      .optional()
      .describe('Optional ingredient swaps applied for this logged meal.'),
    bodyweight_kg: z.number().positive().max(500).optional(),
    water_litres: z.number().nonnegative().max(20).optional(),
    notes: z.string().max(1000).optional(),
    free_meal_used: z.boolean().optional(),
  })
  .strict();

type Input = z.infer<typeof inputSchema>;

interface FoodRow {
  id: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  cholesterol_mg: number;
}

export interface LogMealFromPlanResult {
  ok: true;
  summary: string;
  data: {
    inserted: number;
    adherence_id: string;
    meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
    entries: unknown[];
  };
}
export interface ToolError { ok: false; error: string }

function scaleByGrams(food: FoodRow, grams: number) {
  const factor = food.serving_g > 0 ? grams / food.serving_g : 0;
  return {
    kcal: Math.round(food.kcal * factor),
    protein_g: Math.round(food.protein_g * factor),
    carbs_g: Math.round(food.carbs_g * factor),
    fat_g: Math.round(food.fat_g * factor),
    fiber_g: Math.round(food.fiber_g * factor * 10) / 10,
    sugar_g: Math.round(food.sugar_g * factor * 10) / 10,
    sodium_mg: Math.round(food.sodium_mg * factor),
    cholesterol_mg: Math.round(food.cholesterol_mg * factor),
  };
}

function ingredientLabel(ing: Ingredient): string {
  const en = ing.name_en?.trim();
  const es = ing.name_es?.trim();
  if (en && es && en.toLowerCase() !== es.toLowerCase()) return `${en} · ${es}`;
  return en || es || 'Ingredient';
}

export function makeLogMealFromPlanTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Log a meal from the user's meal plan. Provide meal_id (plan slug like 'desayuno') and option_selected (1-based). Inserts one app_calorie_entries row per quantified ingredient (free items are skipped; unresolved ones land at kcal=0 with a TODO breadcrumb) and upserts a meal_plan_adherence row for today. Uses the user's active plan when meal_plan_id is omitted.",
    inputSchema,
    async execute(input: Input): Promise<LogMealFromPlanResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'log_meal_from_plan', input } as const;

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
        let planId = input.meal_plan_id;
        if (!planId) {
          const { data: prefs } = await supabase
            .from('preferences')
            .select('active_meal_plan_id')
            .eq('user_id', userId)
            .maybeSingle();
          planId = (prefs?.active_meal_plan_id as string | null | undefined) ?? undefined;
          if (!planId) {
            const err = 'no_active_plan';
            await insertToolAudit({ ...auditBase, status: 'error', errorMessage: err });
            return { ok: false, error: err };
          }
        }

        const { data: planRow, error: planErr } = await supabase
          .from('meal_plans')
          .select('id, plan')
          .eq('id', planId)
          .eq('user_id', userId)
          .maybeSingle();
        if (planErr) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: planErr.message });
          return { ok: false, error: planErr.message };
        }
        if (!planRow) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: 'plan_not_found' });
          return { ok: false, error: 'plan_not_found' };
        }

        const planParsed = mealPlanPlanSchema.safeParse(planRow.plan);
        if (!planParsed.success) {
          const err = 'plan_invalid_shape';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: err });
          return { ok: false, error: err };
        }
        const plan = planParsed.data;

        const meal = plan.meals.find((m) => m.id === input.meal_id);
        if (!meal) {
          const err = 'meal_id_not_in_plan';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: err });
          return { ok: false, error: err };
        }
        const option = meal.options.find((o) => o.option === input.option_selected);
        if (!option) {
          const err = 'option_not_in_meal';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: err });
          return { ok: false, error: err };
        }

        const foodIds = Array.from(
          new Set(
            option.ingredients
              .map((i) => i.food_id)
              .filter((v): v is string => typeof v === 'string' && v.length > 0),
          ),
        );
        const customFoodIds = Array.from(
          new Set(
            option.ingredients
              .map((i) => i.custom_food_id)
              .filter((v): v is string => typeof v === 'string' && v.length > 0),
          ),
        );
        const foodMap = new Map<string, FoodRow>();
        const customFoodMap = new Map<string, FoodRow>();
        if (foodIds.length > 0) {
          const { data: foods } = await supabase
            .from('foods')
            .select(
              'id, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg',
            )
            .in('id', foodIds);
          for (const row of foods ?? []) foodMap.set(row.id as string, row as FoodRow);
        }
        if (customFoodIds.length > 0) {
          const { data: customs } = await supabase
            .from('custom_foods')
            .select(
              'id, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg',
            )
            .in('id', customFoodIds)
            .eq('user_id', userId);
          for (const row of customs ?? []) customFoodMap.set(row.id as string, row as FoodRow);
        }

        const mealSlot = input.override_slot ?? mealSlotIdToMfpSlot(meal.id);

        const inserts = [];
        for (const ing of option.ingredients) {
          if (ing.free) continue;
          if (ing.quantity == null || ing.unit == null) continue;
          let nutrition = {
            kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
            fiber_g: 0, sugar_g: 0, sodium_mg: 0, cholesterol_mg: 0,
          };
          if (ing.unit === 'g') {
            if (ing.food_id && foodMap.has(ing.food_id)) {
              nutrition = scaleByGrams(foodMap.get(ing.food_id)!, ing.quantity);
            } else if (ing.custom_food_id && customFoodMap.has(ing.custom_food_id)) {
              nutrition = scaleByGrams(customFoodMap.get(ing.custom_food_id)!, ing.quantity);
            }
          }
          const label = ingredientLabel(ing);
          const qty = `${ing.quantity} ${ing.unit}`;
          const unresolved = nutrition.kcal === 0 && ing.unit !== 'g';
          inserts.push({
            user_id: userId,
            meal: mealSlot,
            ...nutrition,
            raw_input: unresolved
              ? `${label} · ${qty} · TODO: resolve_ingredient`
              : `${label} · ${qty}`,
            food_id: ing.food_id ?? null,
            custom_food_id: ing.custom_food_id ?? null,
            serving_qty: ing.quantity,
            serving_unit: ing.unit,
          });
        }

        let entries: unknown[] = [];
        if (inserts.length > 0) {
          const { data, error } = await supabase
            .from('app_calorie_entries')
            .insert(inserts)
            .select('id, entered_at, meal, raw_input, kcal, protein_g, carbs_g, fat_g');
          if (error) {
            await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
            return { ok: false, error: error.message };
          }
          entries = data ?? [];
        }

        const date =
          input.override_date ?? new Date().toISOString().slice(0, 10);

        const { data: adherence, error: adherenceErr } = await supabase
          .from('meal_plan_adherence')
          .upsert(
            {
              user_id: userId,
              meal_plan_id: planId,
              date,
              meal_id: meal.id,
              option_selected: input.option_selected,
              substitutions: input.substitutions ?? null,
              notes: input.notes ?? null,
              free_meal_used: input.free_meal_used ?? false,
              water_litres: input.water_litres ?? null,
              bodyweight_kg: input.bodyweight_kg ?? null,
            },
            { onConflict: 'user_id,date,meal_id' },
          )
          .select('id')
          .single();

        if (adherenceErr) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: adherenceErr.message });
          return { ok: false, error: adherenceErr.message };
        }

        const output: LogMealFromPlanResult = {
          ok: true,
          summary: `Logged ${meal.name_en ?? meal.name_es ?? meal.id} option ${input.option_selected} — ${inserts.length} entr${inserts.length === 1 ? 'y' : 'ies'} into ${mealSlot}.`,
          data: {
            inserted: inserts.length,
            adherence_id: adherence.id as string,
            meal_slot: mealSlot,
            entries,
          },
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
