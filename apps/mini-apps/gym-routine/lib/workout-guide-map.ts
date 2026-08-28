/**
 * workout-guide-map — maps our internal exercise names to `@bryllim/workout-guide` slugs.
 *
 * The library ships 302 illustrated exercises, keyed by slug. Our exercise
 * catalogue (fixture + Supabase) uses free-form names, so we need a lookup
 * layer. Mapping is currently hand-curated (see `/tmp/exercise-slug-mapping.json`
 * produced by the research agent — 9 exact / 3 fuzzy / 0 no-match for the
 * Jose Alejandro block-1 routine).
 *
 * Resolution order in `resolveSlug`:
 *   1. Explicit `workout_guide_slug` on the exercise object (fixture author
 *      pinned it) — highest confidence.
 *   2. Normalised name lookup against the static NAME_TO_SLUG table.
 *   3. `null` — component falls back to `gif_url` or an empty tile.
 *
 * When we add new routines we extend NAME_TO_SLUG here (or, preferably, pin
 * `workout_guide_slug` in the fixture so the resolver doesn't guess).
 */

/**
 * Name → slug mapping. Keys are lowercased English exercise names as they
 * appear in the routine fixture's `name_en` field, trimmed and squashed to
 * single spaces. Extend this table sparingly — prefer pinning the slug in
 * the fixture.
 */
export const NAME_TO_SLUG: Readonly<Record<string, string>> = {
  'incline press, converging machine': 'incline-dumbbell-press',
  'one-arm dumbbell row': 'one-arm-dumbbell-row',
  'low-cable fly': 'cable-fly',
  'back squat, barbell': 'squat',
  'leg press, 45°': 'leg-press',
  'overhead press, machine': 'machine-shoulder-press',
  'cable lateral raise': 'cable-lateral-raise',
  'romanian deadlift': 'romanian-deadlift',
  'lying leg curl': 'lying-leg-curl',
  'cable curl': 'cable-curl',
  'triceps rope extension': 'rope-tricep-pushdown',
  'hammer curl, dumbbells': 'hammer-curl',
};

/** Loose shape — accepts either the fixture exercise or a Supabase row. */
export type SlugResolvable = {
  workout_guide_slug?: string | null;
  name_en?: string | null;
  name_es?: string | null;
  name?: string | null;
};

function normalise(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolve an exercise to a workout-guide slug.
 *
 * @returns the slug string, or `null` when there's no match. Consumers must
 *   handle `null` and fall back to their alternative asset (usually a gif).
 */
export function resolveSlug(exercise: SlugResolvable): string | null {
  if (exercise.workout_guide_slug) return exercise.workout_guide_slug;

  const candidates = [exercise.name_en, exercise.name].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const key = normalise(candidate);
    if (key && NAME_TO_SLUG[key]) return NAME_TO_SLUG[key];
  }

  return null;
}
