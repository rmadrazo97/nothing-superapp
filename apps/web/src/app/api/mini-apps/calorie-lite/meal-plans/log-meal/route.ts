/**
 * POST /api/mini-apps/calorie-lite/meal-plans/log-meal
 *
 * Body:
 *   {
 *     meal_plan_id?: uuid            // omit to use the user's active plan
 *     meal_id: string                // matches plan.meals[].id (e.g. "desayuno")
 *     option_selected: number        // 1-based option index (matches option.option)
 *     override_slot?: 'breakfast'|'lunch'|'dinner'|'snacks'
 *     override_date?: 'YYYY-MM-DD'   // adherence row date, defaults to today (UTC-day)
 *     substitutions?: [{ingredient_index, replaced_with, note?}]
 *     bodyweight_kg?, water_litres?, notes?, free_meal_used?
 *   }
 *
 * Does two things:
 *   1. Inserts one `app_calorie_entries` row per quantified ingredient. Free
 *      ingredients (free: true) are skipped. When the ingredient carries a
 *      `food_id`/`custom_food_id`, we resolve nutrition from the foods table
 *      and scale by grams. Otherwise the entry lands with kcal=0 + macros=0
 *      and a `raw_input` note including the qty so the user can enrich later.
 *   2. Upserts a `meal_plan_adherence` row for (user, date, meal_id) recording
 *      option_selected + substitutions + optional bodyweight/water/notes.
 *
 * v1 leaves unresolved ingredients at kcal=0 — the copilot's smart tools will
 * improve resolution over time (TODO: resolve_ingredient breadcrumb in
 * raw_input). This ships correct-shape data on day 1 without blocking on a
 * full ingredient-linking pass.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import {
  mealEnum,
  mealPlanPlanSchema,
  mealPlanSubstitutionSchema,
  mealSlotIdToMfpSlot,
  type Ingredient,
  type PlanMeal,
} from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z
  .object({
    meal_plan_id: z.string().uuid().optional(),
    meal_id: z.string().min(1).max(40),
    option_selected: z.number().int().positive().max(50),
    override_slot: mealEnum.optional(),
    override_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    substitutions: z.array(mealPlanSubstitutionSchema).max(30).optional(),
    bodyweight_kg: z.number().positive().max(500).optional(),
    water_litres: z.number().nonnegative().max(20).optional(),
    notes: z.string().max(1000).optional(),
    free_meal_used: z.boolean().optional(),
  })
  .strict();

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

/** Scale per-serving nutrition by the ingredient's gram quantity. */
function scaleByGrams(
  food: FoodRow,
  grams: number,
): {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  cholesterol_mg: number;
} {
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

/** Ingredient display name for `raw_input` — bilingual pair preferred. */
function ingredientLabel(ing: Ingredient): string {
  const en = ing.name_en?.trim();
  const es = ing.name_es?.trim();
  if (en && es && en.toLowerCase() !== es.toLowerCase()) return `${en} · ${es}`;
  return en || es || 'Ingredient';
}

/** e.g. "125 g", "2 unit", "200 ml", "" if free/unquantified. */
function ingredientQtyLabel(ing: Ingredient): string {
  if (ing.free || ing.quantity == null || ing.unit == null) return '';
  return `${ing.quantity} ${ing.unit}`;
}

export async function POST(request: Request) {
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
    return NextResponse.json({ error: 'payment_required', entitlement }, { status: 402 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Resolve the plan — explicit id wins; else the user's active plan.
  let planId = body.meal_plan_id;
  if (!planId) {
    const { data: prefs, error: prefsErr } = await supabase
      .from('preferences')
      .select('active_meal_plan_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (prefsErr) {
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    planId = prefs?.active_meal_plan_id ?? undefined;
    if (!planId) {
      return NextResponse.json({ error: 'no_active_plan' }, { status: 400 });
    }
  }

  const { data: planRow, error: planErr } = await supabase
    .from('meal_plans')
    .select('id, plan')
    .eq('id', planId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (planErr) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
  if (!planRow) {
    return NextResponse.json({ error: 'plan_not_found' }, { status: 404 });
  }

  // Belt-and-suspenders: re-validate the stored plan blob so a corrupted row
  // doesn't crash the aggregator.
  const planParsed = mealPlanPlanSchema.safeParse(planRow.plan);
  if (!planParsed.success) {
    return NextResponse.json({ error: 'plan_invalid_shape' }, { status: 500 });
  }
  const plan = planParsed.data;

  const meal = plan.meals.find((m: PlanMeal) => m.id === body.meal_id);
  if (!meal) {
    return NextResponse.json({ error: 'meal_id_not_in_plan' }, { status: 400 });
  }
  const option = meal.options.find((o) => o.option === body.option_selected);
  if (!option) {
    return NextResponse.json({ error: 'option_not_in_meal' }, { status: 400 });
  }

  // Resolve food refs referenced by this option's ingredients (best effort).
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
      .eq('user_id', user.id);
    for (const row of customs ?? []) customFoodMap.set(row.id as string, row as FoodRow);
  }

  const mealSlot = body.override_slot ?? mealSlotIdToMfpSlot(meal.id);

  // Build per-ingredient inserts. Free items are skipped (they don't count
  // toward macros); unquantified generics (quantity null && !free) shouldn't
  // reach here (Zod refine catches it), but we guard anyway.
  type Insert = {
    user_id: string;
    meal: typeof mealSlot;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    sodium_mg: number;
    cholesterol_mg: number;
    raw_input: string;
    food_id: string | null;
    custom_food_id: string | null;
    serving_qty: number | null;
    serving_unit: string | null;
  };
  const inserts: Insert[] = [];

  for (const ing of option.ingredients) {
    if (ing.free) continue;
    if (ing.quantity == null || ing.unit == null) continue;

    let nutrition = {
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
      cholesterol_mg: 0,
    };

    // Resolve nutrition if there's a food ref AND the ingredient is measured
    // in grams (per-100g scaling only makes sense for mass; for 'ml' or
    // 'unit' we leave nutrition at 0 and let the copilot fix it up later).
    if (ing.unit === 'g') {
      if (ing.food_id && foodMap.has(ing.food_id)) {
        nutrition = scaleByGrams(foodMap.get(ing.food_id)!, ing.quantity);
      } else if (ing.custom_food_id && customFoodMap.has(ing.custom_food_id)) {
        nutrition = scaleByGrams(customFoodMap.get(ing.custom_food_id)!, ing.quantity);
      }
    }

    const label = ingredientLabel(ing);
    const qty = ingredientQtyLabel(ing);
    const unresolved = nutrition.kcal === 0 && ing.unit !== 'g';
    // Leave a breadcrumb for the copilot's future resolve_ingredient tool.
    const rawInput = unresolved
      ? `${label} · ${qty} · TODO: resolve_ingredient`
      : `${label} · ${qty}`;

    inserts.push({
      user_id: user.id,
      meal: mealSlot,
      ...nutrition,
      raw_input: rawInput,
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
      .select(
        'id, entered_at, meal, raw_input, kcal, protein_g, carbs_g, fat_g',
      );
    if (error) {
      return NextResponse.json({ error: 'db_error', message: error.message }, { status: 500 });
    }
    entries = data ?? [];
  }

  // Upsert the adherence row for (user, date, meal_id). Date defaults to
  // today in the server's local timezone; the client can override for
  // back-fill.
  const today = new Date();
  const iso = today.toISOString();
  const defaultDate = iso.slice(0, 10);
  const date = body.override_date ?? defaultDate;

  const { data: adherence, error: adherenceErr } = await supabase
    .from('meal_plan_adherence')
    .upsert(
      {
        user_id: user.id,
        meal_plan_id: planId,
        date,
        meal_id: meal.id,
        option_selected: body.option_selected,
        substitutions: body.substitutions ?? null,
        notes: body.notes ?? null,
        free_meal_used: body.free_meal_used ?? false,
        water_litres: body.water_litres ?? null,
        bodyweight_kg: body.bodyweight_kg ?? null,
      },
      { onConflict: 'user_id,date,meal_id' },
    )
    .select('id')
    .single();

  if (adherenceErr) {
    return NextResponse.json(
      { error: 'adherence_db_error', message: adherenceErr.message, inserted: inserts.length, entries },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    inserted: inserts.length,
    entries,
    adherence_id: adherence.id,
    meal_slot: mealSlot,
  });
}
