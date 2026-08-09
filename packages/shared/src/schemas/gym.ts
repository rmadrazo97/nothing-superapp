/**
 * gym.ts — v2 (schema_version 1.0) coach-grade routine schemas.
 *
 * v1 routine shapes still live in `index.ts` (workoutRoutineSchema et al.) —
 * this file adds the richer v2 shape without touching them. Both coexist on
 * the same `workout_routines` table: v2 rows carry `plan` (jsonb) plus
 * `schema_version='1.0'`; v1 rows keep the flat `exercises` column.
 *
 * The whole `plan` object is intentionally a single Zod schema (not a bag of
 * column-per-field scalars) because a v2 routine is coach-authored and
 * changes shape with the sport (blocks for lifting, intervals for running,
 * rounds for combat sports). One well-typed jsonb blob is cheaper to iterate
 * on than a dozen migrations.
 *
 * The copilot generates v2 routines via `create_gym_routine` — the tool's
 * `inputSchema` is `routineV2InsertSchema` so the LLM gets a strict shape
 * to fill in.
 */
import { z } from 'zod';

// ─── Ranges (reps / RIR / rest) ────────────────────────────────────────────
// All three are `{min, max}` with a refinement that max >= min. Kept as
// separate schemas rather than a generic so the error messages point at
// the field the coach actually authored ("reps" not "range").

export const repRangeSchema = z
  .object({
    min: z.number().int().nonnegative().max(999),
    max: z.number().int().nonnegative().max(999),
  })
  .refine((v) => v.max >= v.min, { message: 'reps.max must be >= reps.min' });

// RIR (Reps In Reserve) is authored as a range with fractional values allowed
// (some coaches use "1.5 RIR" as shorthand). Range 0..5 covers real-world use;
// RIR > 5 means you're not close enough to failure to be useful.
export const rirRangeSchema = z
  .object({
    min: z.number().min(0).max(5),
    max: z.number().min(0).max(5),
  })
  .refine((v) => v.max >= v.min, { message: 'rir.max must be >= rir.min' });

// Rest between sets, in seconds. 0 (no rest) through 600 (10 min top-set rest)
// covers everything from circuit training to heavy singles.
export const restRangeSchema = z
  .object({
    min: z.number().int().min(0).max(600),
    max: z.number().int().min(0).max(600),
  })
  .refine((v) => v.max >= v.min, { message: 'rest.max must be >= rest.min' });

// ─── Enums ─────────────────────────────────────────────────────────────────

// Roles within a single exercise's block list.
//   top_set — the first, most-important set (heavy, prioritised).
//   backoff — reduced-load sets following the top set.
//   straight — plain sets, no top/backoff distinction.
export const blockRoleEnum = z.enum(['top_set', 'backoff', 'straight']);

// How an exercise is structured. Start with three shipping structures and
// leave cluster/drop_set slots free for later so the enum can extend without
// a breaking rename.
export const structureEnum = z.enum([
  'straight',
  'top_set_backoff',
  'superset',
  'cluster', // reserved for future — rest-pause / cluster sets
  'drop_set', // reserved for future — drop sets down the stack
]);

// ─── Blocks + superset components ──────────────────────────────────────────

// One block within a single exercise's set list. `reps` is a range; `rir` is
// optional because bodyweight / warmup blocks may omit it.
export const exerciseBlockSchema = z.object({
  role: blockRoleEnum,
  sets: z.number().int().positive().max(20),
  reps: repRangeSchema,
  rir: rirRangeSchema.optional(),
});

// A superset couples two (or more) exercises with no rest between them —
// each component has its own name + reps + optional RIR. `sets` on a
// component is per-component per-round; typically all components share the
// same value but we keep it flexible.
export const supersetComponentSchema = z.object({
  order: z.number().int().positive().max(10),
  name_es: z.string().max(200).optional(),
  name_en: z.string().max(200).optional(),
  primary_muscles: z.array(z.string().max(60)).max(10).optional(),
  equipment: z.string().max(60).optional(),
  exercise_id: z.string().max(120).optional(), // fk to exercises table if known
  sets: z.number().int().positive().max(20),
  reps: repRangeSchema,
  rir: rirRangeSchema.optional(),
});

// ─── Plan exercise (discriminated union on `structure`) ────────────────────
// Zod's discriminated union gives the LLM a precise "if structure is X you
// must include Y" contract, which is exactly the shape a coach's mental
// model uses.

const planExerciseCommon = {
  id: z.string().min(1).max(40), // e.g. "d1e3"
  order: z.number().int().positive().max(50),
  name_es: z.string().max(200).optional(),
  name_en: z.string().max(200).optional(),
  pattern: z.string().max(60).optional(), // 'horizontal_push', 'squat', etc.
  primary_muscles: z.array(z.string().max(60)).max(10).optional(),
  equipment: z.string().max(60).optional(),
  exercise_id: z.string().max(120).optional(), // fk to exercises catalog if known
  unilateral: z.boolean().optional(),
  reps_per_side: z.boolean().optional(),
  sets_total: z.number().int().positive().max(50),
  rest_seconds: restRangeSchema,
  alternatives: z.array(z.string().max(200)).max(10).optional(),
  // `raw` preserves the coach's original notation ("1 + 3", "6-8 / 8-10") so
  // the UI can show a "coach wrote:" annotation. Optional, free-form.
  raw: z.record(z.string(), z.string()).optional(),
};

const straightExerciseSchema = z.object({
  ...planExerciseCommon,
  structure: z.literal('straight'),
  blocks: z.array(exerciseBlockSchema).min(1).max(10),
});

const topSetBackoffExerciseSchema = z.object({
  ...planExerciseCommon,
  structure: z.literal('top_set_backoff'),
  blocks: z.array(exerciseBlockSchema).min(2).max(10),
});

const supersetExerciseSchema = z.object({
  ...planExerciseCommon,
  structure: z.literal('superset'),
  rounds: z.number().int().positive().max(20),
  components: z.array(supersetComponentSchema).min(2).max(6),
  rest_note: z.string().max(500).optional(),
});

export const planExerciseSchema = z.discriminatedUnion('structure', [
  straightExerciseSchema,
  topSetBackoffExerciseSchema,
  supersetExerciseSchema,
]);

// ─── Plan day + top-level plan ─────────────────────────────────────────────

export const planDaySchema = z.object({
  day: z.number().int().positive().max(14),
  name_es: z.string().max(200).optional(),
  name_en: z.string().max(200).optional(),
  focus: z.array(z.string().max(60)).max(10).default([]),
  exercises: z.array(planExerciseSchema).min(1).max(30),
});

export const planCardioSchema = z.object({
  daily_steps: z.number().int().nonnegative().max(100000).optional(),
  post_workout: z
    .object({
      modality: z.string().min(1).max(60),
      duration_minutes: z.number().int().positive().max(240),
      target_heart_rate_bpm: z.number().int().positive().max(230).optional(),
    })
    .optional(),
  note: z.string().max(1000).optional(),
});

// Conventions are free-form key→string pairs — every coach uses slightly
// different names (sets_notation, reps_notation, rir_notation, top_set_rule,
// rir_definition, coach_note, …). Kept as a record so the LLM can pass the
// coach's exact language through without us maintaining an enum.
export const planConventionsSchema = z.record(z.string().max(60), z.string().max(2000));

export const planUnitsSchema = z.object({
  load: z.enum(['kg', 'lb']).default('kg'),
  rest: z.enum(['seconds', 'minutes']).default('seconds'),
});

export const planSchema = z.object({
  id: z.string().min(1).max(120), // e.g. "plan_jam_v1"
  split: z.string().max(120).optional(),
  sessions_per_week: z.number().int().positive().max(14).optional(),
  units: planUnitsSchema.optional(),
  conventions: planConventionsSchema.optional(),
  cardio: planCardioSchema.optional(),
  tracking_fields: z.array(z.string().max(60)).max(20).optional(),
  days: z.array(planDaySchema).min(1).max(14),
});

// ─── Top-level routine v2 wrapper ──────────────────────────────────────────

export const routineSourceSchema = z.object({
  file: z.string().max(500).optional(),
  sheet: z.string().max(200).optional(),
  title: z.string().max(500).optional(),
  language_original: z.string().max(20).optional(),
});

export const routineAthleteSchema = z.object({
  name: z.string().max(200).optional(),
});

export const routineV2Schema = z.object({
  schema_version: z.literal('1.0'),
  source: routineSourceSchema.optional(),
  athlete: routineAthleteSchema.optional(),
  plan: planSchema,
  parsing_notes: z.array(z.string().max(1000)).max(50).default([]),
});

// Insert shape — same as routineV2Schema (no server-owned fields; user_id
// and the routine row's `name` are set by the API layer, not the client).
// The caller may include a `name` override for the `workout_routines.name`
// column; otherwise the API derives it from source.title or plan.id.
export const routineV2InsertSchema = routineV2Schema.extend({
  name: z.string().min(1).max(120).optional(),
});

// ─── Inferred TS types ─────────────────────────────────────────────────────

export type RepRange = z.infer<typeof repRangeSchema>;
export type RirRange = z.infer<typeof rirRangeSchema>;
export type RestRange = z.infer<typeof restRangeSchema>;
export type BlockRole = z.infer<typeof blockRoleEnum>;
export type Structure = z.infer<typeof structureEnum>;
export type ExerciseBlock = z.infer<typeof exerciseBlockSchema>;
export type SupersetComponent = z.infer<typeof supersetComponentSchema>;
export type PlanExercise = z.infer<typeof planExerciseSchema>;
export type PlanDay = z.infer<typeof planDaySchema>;
export type PlanCardio = z.infer<typeof planCardioSchema>;
export type PlanConventions = z.infer<typeof planConventionsSchema>;
export type PlanUnits = z.infer<typeof planUnitsSchema>;
export type Plan = z.infer<typeof planSchema>;
export type RoutineSource = z.infer<typeof routineSourceSchema>;
export type RoutineAthlete = z.infer<typeof routineAthleteSchema>;
export type RoutineV2 = z.infer<typeof routineV2Schema>;
export type RoutineV2Insert = z.infer<typeof routineV2InsertSchema>;

/**
 * Discriminator helper — checks whether a raw routine row from the DB is v2.
 * A row is v2 if either `schema_version === '1.0'` AND `plan` is non-null,
 * or a plausible `plan.days` array exists. Kept forgiving because v1 rows
 * pre-migration 011 had no schema_version, and migration sets a default.
 */
export function isRoutineV2(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as { plan?: unknown; schema_version?: unknown };
  if (r.plan == null) return false;
  if (typeof r.plan !== 'object') return false;
  const p = r.plan as { days?: unknown };
  return Array.isArray(p.days) && p.days.length > 0;
}
