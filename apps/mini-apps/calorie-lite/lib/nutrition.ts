/**
 * Pure helpers for scaling food nutrition to a chosen serving size.
 *
 * The `foods` and `custom_foods` tables store per-serving nutrition (with
 * `serving_g` giving grams-per-serving). The UI lets the user pick either
 * "N servings" or "N grams"; this module turns that into the integer/round
 * kcal + macro numbers we snapshot into `app_calorie_entries`.
 *
 * We snapshot rounded integers because:
 *   - the entries API validates `kcal: z.number().int()` (belt-and-suspenders
 *     — humans don't need 1.7-kcal precision in the daily tally)
 *   - macros are visually rendered as integers in the today feed
 *
 * We use a two-decimal internal round only for the returned nutrient grams
 * that the API accepts as floats (fiber/sugar/sodium/cholesterol).
 */

/** Shape of a food row (public OR custom) — only the fields we need. */
export interface FoodLike {
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  cholesterol_mg?: number;
}

/** Snapshotted nutrition for one logged serving of a food. */
export interface EntryNutrition {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  cholesterol_mg: number;
}

export type ServingUnit = 'serving' | 'g';

/** Round to nearest integer; NaN/Infinity → 0 so bad inputs never persist. */
function toInt(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/** Two-decimal round for float fields; NaN/Infinity → 0. */
function to2(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Given a food + quantity + unit, return the scaled nutrition.
 *
 *   computeEntryNutrition(chicken, 1.5, 'serving') // 1.5 × per-serving values
 *   computeEntryNutrition(chicken, 200, 'g')       // (200 / serving_g) × per-serving values
 *
 * A qty of 0 (or a non-positive input) returns all-zero nutrition; callers
 * should refuse to submit that but we guard here so the reducer is total.
 */
export function computeEntryNutrition(
  food: FoodLike,
  qty: number,
  unit: ServingUnit = 'serving',
): EntryNutrition {
  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
      cholesterol_mg: 0,
    };
  }

  // Multiplier: how many "servings" is the user logging?
  //   unit=serving → qty is already in servings.
  //   unit=g       → qty grams ÷ grams-per-serving = servings.
  let multiplier: number;
  if (unit === 'g') {
    const servingG = Number(food.serving_g);
    if (!Number.isFinite(servingG) || servingG <= 0) {
      // Corrupt food row — fall back to treating qty as a raw multiplier so
      // we never divide by zero. Better than throwing at the UI layer.
      multiplier = qty;
    } else {
      multiplier = qty / servingG;
    }
  } else {
    multiplier = qty;
  }

  return {
    kcal: toInt(Number(food.kcal) * multiplier),
    protein_g: to2(Number(food.protein_g) * multiplier),
    carbs_g: to2(Number(food.carbs_g) * multiplier),
    fat_g: to2(Number(food.fat_g) * multiplier),
    fiber_g: to2(Number(food.fiber_g ?? 0) * multiplier),
    sugar_g: to2(Number(food.sugar_g ?? 0) * multiplier),
    sodium_mg: to2(Number(food.sodium_mg ?? 0) * multiplier),
    cholesterol_mg: to2(Number(food.cholesterol_mg ?? 0) * multiplier),
  };
}

/** Short macro line for the food row preview: "P 24g · C 0g · F 3g". */
export function macroPreview(food: FoodLike): string {
  const p = toInt(Number(food.protein_g));
  const c = toInt(Number(food.carbs_g));
  const f = toInt(Number(food.fat_g));
  return `P ${p}g · C ${c}g · F ${f}g`;
}
