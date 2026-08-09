/**
 * meal-plan.ts — v1 (schema_version 1.0) nutritionist-style meal plan schemas.
 *
 * The reference plan at
 *   apps/mini-apps/calorie-lite/fixtures/diet-jam-v1.json
 * is canonical. If this schema can't parse that fixture the schema is wrong.
 *
 * Why one big jsonb blob and not columns-per-field:
 *   - A real nutritionist plan is a nested tree (meals → options → ingredients)
 *     with flexible optional rules; shredding into tables gives us many joins
 *     for zero win. Same call as gym-routine v2 (migration 011).
 *   - The whole `plan` object is validated by `planSchema` on write via
 *     `mealPlanInsertSchema`; on read the API returns the raw jsonb and the
 *     UI trusts the write-time validation.
 *
 * Design decisions that came from the fixture:
 *   1. `meal.id` is a free-form slug (e.g. `desayuno`, `snack1`), NOT a fixed
 *      enum. A user's nutritionist may name meals however they like.
 *   2. Ingredients can be `free: true` (unlimited salads/veg with
 *      `quantity: null`, `unit: null`) or normal (positive `quantity` + unit).
 *      A `.refine()` enforces the pairing.
 *   3. Ingredients can be `generic: true` (e.g. "Fruta 150 g" — any fruit).
 *   4. All rule sub-objects are optional — a plan may have none, some, or all.
 *   5. Bilingual name pairs (`name_es`/`name_en`) are optional; the app
 *      falls back to whichever is present.
 */
import { z } from 'zod';

// ─── Units ─────────────────────────────────────────────────────────────────

export const massUnitEnum = z.enum(['g', 'oz']);
export const volumeUnitEnum = z.enum(['ml', 'floz']);
export const energyUnitEnum = z.enum(['kcal', 'kj']);
// Per-ingredient unit — 'unit' is used for countable items like eggs.
export const ingredientUnitEnum = z.enum(['g', 'ml', 'unit']);

export const mealPlanUnitsSchema = z.object({
  mass: massUnitEnum.default('g'),
  volume: volumeUnitEnum.default('ml'),
  energy: energyUnitEnum.default('kcal'),
});

// ─── Targets ───────────────────────────────────────────────────────────────

export const dailyTargetsSchema = z.object({
  label_es: z.string().max(200).optional(),
  label_en: z.string().max(200).optional(),
  calories_kcal: z.number().nonnegative().max(20000),
  protein_g: z.number().nonnegative().max(2000),
  fat_g: z.number().nonnegative().max(2000),
  carbs_g: z.number().nonnegative().max(2000),
  is_starting_point: z.boolean().optional(),
});

export const mealTargetsSchema = z.object({
  protein_g: z.number().nonnegative().max(2000),
  carbs_g: z.number().nonnegative().max(2000),
  fat_g: z.number().nonnegative().max(2000),
  calories_kcal: z.number().nonnegative().max(20000),
});

// ─── Ingredient ────────────────────────────────────────────────────────────

// `free: true` means unlimited/uncounted (salads, tomato slices, veg). In that
// case `quantity` may be null and `unit` may be null. Otherwise both must be
// concrete: `quantity` is a positive number and `unit` is one of g/ml/unit.
export const ingredientSchema = z
  .object({
    name_es: z.string().max(300).optional(),
    name_en: z.string().max(300).optional(),
    quantity: z.number().positive().max(10000).nullable(),
    unit: ingredientUnitEnum.nullable(),
    free: z.boolean().optional(),
    generic: z.boolean().optional(),
    // Optional refs to the shared `foods` catalog or the user's `custom_foods`
    // so downstream tools can resolve macros. Not required — the copilot may
    // fill these in over time.
    food_id: z.string().max(120).optional(),
    custom_food_id: z.string().uuid().optional(),
    // Free-form parser breadcrumb ("Fruta 150 g") — optional.
    note_es: z.string().max(500).optional(),
    note_en: z.string().max(500).optional(),
  })
  .refine(
    (v) => {
      if (v.free === true) return true; // free items may skip quantity/unit
      return v.quantity != null && v.quantity > 0 && v.unit != null;
    },
    {
      message:
        'ingredient must have positive quantity + unit unless free: true',
      path: ['quantity'],
    },
  )
  .refine(
    (v) => v.name_es != null || v.name_en != null,
    { message: 'ingredient must have at least one of name_es or name_en', path: ['name_en'] },
  );

// ─── Options + Meals ───────────────────────────────────────────────────────

export const planMealOptionSchema = z.object({
  option: z.number().int().positive().max(50),
  label_es: z.string().max(200).optional(),
  label_en: z.string().max(200).optional(),
  dish_es: z.string().max(200).optional(),
  dish_en: z.string().max(200).optional(),
  ingredients: z.array(ingredientSchema).min(1).max(30),
});

// Meal slot id — loose string so users can slug it as they like. Kept short
// so it fits on a chip and stays URL-safe if we ever route by it.
export const mealSlotIdEnum = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_\-]+$/i, 'meal id must be alphanumeric, underscore, or hyphen');

export const planMealSchema = z.object({
  id: mealSlotIdEnum,
  name_es: z.string().max(200).optional(),
  name_en: z.string().max(200).optional(),
  order: z.number().int().positive().max(20),
  targets: mealTargetsSchema,
  options: z.array(planMealOptionSchema).min(1).max(20),
});

// ─── Rules ─────────────────────────────────────────────────────────────────

export const weighingStateEnum = z.enum(['raw', 'cooked', 'either']);

export const planRulesSchema = z
  .object({
    weighing: z
      .object({
        state: weighingStateEnum,
        note_es: z.string().max(1000).optional(),
        note_en: z.string().max(1000).optional(),
      })
      .optional(),
    vegetables: z
      .object({
        applies_to: z.array(mealSlotIdEnum).max(20),
        unlimited: z.boolean(),
        optional: z.boolean(),
        fallback: z.string().max(120).optional(),
        note_es: z.string().max(1000).optional(),
        note_en: z.string().max(1000).optional(),
      })
      .optional(),
    free_meal: z
      .object({
        per_week: z.number().int().nonnegative().max(21),
        note_es: z.string().max(1000).optional(),
        note_en: z.string().max(1000).optional(),
      })
      .optional(),
    hydration: z
      .object({
        min_water_litres: z.number().nonnegative().max(20),
      })
      .optional(),
    allowed_free_drinks: z.array(z.string().max(60)).max(20).optional(),
    option_interchangeability: z
      .object({
        across_meals: z.boolean(),
        note_es: z.string().max(1000).optional(),
        note_en: z.string().max(1000).optional(),
      })
      .optional(),
    protein_source_swap: z
      .object({
        allowed: z.boolean(),
        scope: z.enum(['within_and_between_options', 'within_option_only']),
        note_es: z.string().max(1000).optional(),
        note_en: z.string().max(1000).optional(),
      })
      .optional(),
  })
  .partial();

// ─── Athlete + source ──────────────────────────────────────────────────────

export const planAthleteSchema = z.object({
  name: z.string().max(200).optional(),
  weight_kg: z.number().positive().max(500).optional(),
  height_m: z.number().positive().max(3).optional(),
  activity: z
    .object({
      description_es: z.string().max(500).optional(),
      description_en: z.string().max(500).optional(),
      occupational_activity: z.string().max(60).optional(),
      training_sessions_per_week: z.number().int().nonnegative().max(21).optional(),
    })
    .optional(),
});

export const mealPlanSourceSchema = z.object({
  file: z.string().max(500).optional(),
  title: z.string().max(500).optional(),
  language_original: z.string().max(20).optional(),
  author_role: z.string().max(60).optional(),
});

// ─── Plan + top-level wrapper ──────────────────────────────────────────────

export const planSchema = z.object({
  id: z.string().max(120).optional(),
  goal_es: z.string().max(500).optional(),
  goal_en: z.string().max(500).optional(),
  meals_per_day: z.number().int().positive().max(12).optional(),
  units: mealPlanUnitsSchema.optional(),
  daily_targets: dailyTargetsSchema,
  rules: planRulesSchema.optional(),
  meals: z.array(planMealSchema).min(1).max(12),
  tracking_fields: z.array(z.string().max(60)).max(30).optional(),
});

export const mealPlanSchema = z.object({
  schema_version: z.literal('1.0'),
  source: mealPlanSourceSchema.optional(),
  athlete: planAthleteSchema.optional(),
  plan: planSchema,
  parsing_notes: z.array(z.string().max(2000)).max(50).default([]),
});

// Insert shape — same as mealPlanSchema plus an optional row-level `name`
// override for the `meal_plans.name` column. `id`, `user_id`, timestamps are
// server-owned.
export const mealPlanInsertSchema = mealPlanSchema.extend({
  name: z.string().min(1).max(120).optional(),
  is_template: z.boolean().optional(),
});

// ─── Adherence log ─────────────────────────────────────────────────────────

export const mealPlanSubstitutionSchema = z.object({
  ingredient_index: z.number().int().nonnegative().max(50),
  replaced_with: z.string().max(300),
  note: z.string().max(500).optional(),
});

export const mealPlanAdherenceSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  meal_plan_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal_id: mealSlotIdEnum,
  option_selected: z.number().int().nonnegative().max(50).nullable(),
  substitutions: z.array(mealPlanSubstitutionSchema).max(30).nullable(),
  notes: z.string().max(1000).nullable(),
  free_meal_used: z.boolean().default(false),
  water_litres: z.number().nonnegative().max(20).nullable(),
  bodyweight_kg: z.number().positive().max(500).nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const mealPlanAdherenceInsertSchema = z
  .object({
    meal_plan_id: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    meal_id: mealSlotIdEnum,
    option_selected: z.number().int().nonnegative().max(50).nullable().optional(),
    substitutions: z.array(mealPlanSubstitutionSchema).max(30).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    free_meal_used: z.boolean().optional(),
    water_litres: z.number().nonnegative().max(20).nullable().optional(),
    bodyweight_kg: z.number().positive().max(500).nullable().optional(),
  })
  .strict();

// ─── Inferred TS types ─────────────────────────────────────────────────────

export type MassUnit = z.infer<typeof massUnitEnum>;
export type MealPlanVolumeUnit = z.infer<typeof volumeUnitEnum>;
export type EnergyUnit = z.infer<typeof energyUnitEnum>;
export type IngredientUnit = z.infer<typeof ingredientUnitEnum>;
export type MealPlanUnits = z.infer<typeof mealPlanUnitsSchema>;
export type DailyTargets = z.infer<typeof dailyTargetsSchema>;
export type MealTargets = z.infer<typeof mealTargetsSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type PlanMealOption = z.infer<typeof planMealOptionSchema>;
export type MealSlotId = z.infer<typeof mealSlotIdEnum>;
export type PlanMeal = z.infer<typeof planMealSchema>;
export type PlanRules = z.infer<typeof planRulesSchema>;
export type PlanAthlete = z.infer<typeof planAthleteSchema>;
export type MealPlanSource = z.infer<typeof mealPlanSourceSchema>;
export type MealPlanPlan = z.infer<typeof planSchema>;
export type MealPlan = z.infer<typeof mealPlanSchema>;
export type MealPlanInsert = z.infer<typeof mealPlanInsertSchema>;
export type MealPlanSubstitution = z.infer<typeof mealPlanSubstitutionSchema>;
export type MealPlanAdherence = z.infer<typeof mealPlanAdherenceSchema>;
export type MealPlanAdherenceInsert = z.infer<typeof mealPlanAdherenceInsertSchema>;

/**
 * Map a plan's meal slot id to the fixed `app_calorie_entries.meal_slot` enum.
 * Preserves the plan's semantic slot when we insert entries so the TODAY view
 * groups them into the right bucket. Any unknown id falls to 'snacks'.
 */
export function mealSlotIdToMfpSlot(
  mealId: string,
): 'breakfast' | 'lunch' | 'dinner' | 'snacks' {
  const s = mealId.toLowerCase();
  if (s === 'desayuno' || s === 'breakfast' || s === 'bfast') return 'breakfast';
  if (s === 'comida' || s === 'lunch' || s === 'almuerzo') return 'lunch';
  if (s === 'cena' || s === 'dinner' || s === 'supper') return 'dinner';
  if (s.startsWith('snack') || s === 'merienda' || s === 'colacion' || s === 'colación') {
    return 'snacks';
  }
  return 'snacks';
}
