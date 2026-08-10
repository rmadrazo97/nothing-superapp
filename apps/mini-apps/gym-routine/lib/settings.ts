/**
 * Shared types + helpers for gym per-mini-app settings.
 *
 * Kept as a plain module so both the settings panel AND the live-session
 * view can consume the same shape without a circular import through the
 * settings component tree.
 */

export type WeightUnit = 'lbs' | 'kg';
export type LengthUnit = 'in' | 'cm';

export type GymSettings = {
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
};

export const GYM_SETTINGS_DEFAULTS: GymSettings = {
  weightUnit: 'lbs',
  lengthUnit: 'in',
};

/**
 * The Gym Visual exercise catalog uses free-form equipment strings. The
 * canonical body-weight token is `'body weight'` (see migration 003's
 * inline comment) but a few variants sneak in via later imports — treat
 * every equipment value that contains "body" as body-weight for the
 * BW-input hiding logic. False positives here are cosmetic (input hides
 * when it maybe shouldn't) and easily fixed by the user tapping the
 * "Body weight" pill to expose the field.
 */
export function isBodyWeightEquipment(equipment: string | null | undefined): boolean {
  if (!equipment) return false;
  const e = equipment.trim().toLowerCase();
  return e === 'body weight' || e === 'bodyweight' || e === 'none' || e === '';
}
