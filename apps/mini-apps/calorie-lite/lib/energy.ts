/**
 * energy.ts — pure Mifflin-St Jeor + activity-multiplier + goal-delta helpers.
 *
 * Kept side-effect-free so the wizard can preview the daily target the
 * instant the user finishes the ACTIVITY step. All units are SI (kg, cm,
 * years); UI converts lbs → kg and ft/in → cm before calling in.
 *
 * References:
 *   Mifflin, MD et al. (1990) A new predictive equation for resting energy
 *   expenditure in healthy individuals. Am J Clin Nutr, 51(2), 241–247.
 */

import type { ActivityLevel, GoalDirection, Sex } from '@nothing/shared';

/** kcal per kg of body-fat delta targeted per week — divide by 7 for daily. */
const KCAL_PER_KG_PER_WEEK = 7700;
/** Daily kcal delta = (KCAL_PER_KG_PER_WEEK / 7) ≈ 1100 for a 1 kg/week rate. */
const DAILY_KCAL_PER_KG_WEEK = KCAL_PER_KG_PER_WEEK / 7;

/** Safety floor — never recommend below this even if formula says less. */
export const MIN_DAILY_KCAL = 1200;

/** Harris-Benedict activity multipliers, matching the DB enum values. */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Atwater factors (kcal per gram) — used to convert kcal → macro grams. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Round to the nearest multiple of 10 — kcal targets don't need finer. */
export function roundToNearest10(n: number): number {
  return Math.round(n / 10) * 10;
}

/**
 * Mifflin-St Jeor BMR. `sex === 'other'` averages the male + female
 * formulas — clinically imperfect but the sanest default we can offer
 * without asking for a body composition scan.
 */
export function computeBMR(input: {
  sex: Sex;
  age_years: number;
  height_cm: number;
  weight_kg: number;
}): number {
  const { sex, age_years, height_cm, weight_kg } = input;
  const male = 10 * weight_kg + 6.25 * height_cm - 5 * age_years + 5;
  const female = 10 * weight_kg + 6.25 * height_cm - 5 * age_years - 161;
  if (sex === 'male') return male;
  if (sex === 'female') return female;
  return (male + female) / 2;
}

/** TDEE = BMR × activity multiplier. Rounded stays for later. */
export function computeTDEE(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activity];
}

export type TargetInput = {
  tdee: number;
  goal: GoalDirection;
  /** kg per week; only used for lose/gain. Ignored for maintain. */
  rate_kg_per_week?: number;
};

export type TargetResult = {
  /** Final rounded kcal target after clamping to MIN_DAILY_KCAL. */
  target_kcal: number;
  /** True when we clamped up to MIN_DAILY_KCAL. UI shows a warning. */
  clamped_to_min: boolean;
  /** The unclamped rounded value, useful for debug/UI transparency. */
  raw_target_kcal: number;
};

/**
 * Compute the daily calorie target from TDEE + goal direction + rate.
 *
 * Rate defaults to 0.5 kg/week which is the "safe cut/lean bulk" middle
 * ground most sources recommend. Values >0.75 kg/week get a UI warning
 * (handled at the wizard layer, not here).
 */
export function computeTarget({
  tdee,
  goal,
  rate_kg_per_week = 0.5,
}: TargetInput): TargetResult {
  const delta = DAILY_KCAL_PER_KG_WEEK * rate_kg_per_week;
  let raw = tdee;
  if (goal === 'lose') raw = tdee - delta;
  else if (goal === 'gain') raw = tdee + delta;

  const roundedRaw = roundToNearest10(raw);
  const clamped = roundedRaw < MIN_DAILY_KCAL;
  return {
    target_kcal: clamped ? MIN_DAILY_KCAL : roundedRaw,
    clamped_to_min: clamped,
    raw_target_kcal: roundedRaw,
  };
}

export type MacroPct = { protein: number; carbs: number; fat: number };
export type MacroGrams = { protein_g: number; carbs_g: number; fat_g: number };

/**
 * Split a kcal target into grams of protein / carbs / fat by percentage,
 * using Atwater factors. Percentages should sum to 100 but we don't
 * enforce here — that's the shared zod schema's job.
 */
export function deriveMacroGrams(target_kcal: number, pct: MacroPct): MacroGrams {
  const proteinKcal = (target_kcal * pct.protein) / 100;
  const carbsKcal = (target_kcal * pct.carbs) / 100;
  const fatKcal = (target_kcal * pct.fat) / 100;
  return {
    protein_g: Math.round(proteinKcal / KCAL_PER_G.protein),
    carbs_g: Math.round(carbsKcal / KCAL_PER_G.carbs),
    fat_g: Math.round(fatKcal / KCAL_PER_G.fat),
  };
}

// ─── Unit conversions (UI helpers) ─────────────────────────────────────────
// Kept here so the wizard doesn't sprinkle magic numbers.

export const LB_PER_KG = 2.2046226218;
export const CM_PER_INCH = 2.54;
export const INCH_PER_FOOT = 12;

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}
export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}
export function cmToFeetInches(cm: number): { ft: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  const ft = Math.floor(totalInches / INCH_PER_FOOT);
  const inches = Math.round(totalInches - ft * INCH_PER_FOOT);
  return { ft, inches };
}
