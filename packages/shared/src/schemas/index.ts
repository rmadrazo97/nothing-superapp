import { z } from 'zod';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const subscriptionStatusEnum = z.enum([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
]);

export const mealEnum = z.enum(['breakfast', 'lunch', 'dinner', 'snacks']);

export const themeEnum = z.enum(['dark', 'light']);

// ─── Event kinds (typed constants) ─────────────────────────────────────────
// Kept as a const map so consumers can reference by symbolic name AND
// derive a union type from the values.
export const EVENT_KINDS = {
  calorie_entry_added: 'calorie.entry.added',
  calorie_entry_deleted: 'calorie.entry.deleted',
  preferences_updated: 'preferences.updated',
  subscription_changed: 'subscription.changed',
} as const;

export const eventKindSchema = z.enum([
  EVENT_KINDS.calorie_entry_added,
  EVENT_KINDS.calorie_entry_deleted,
  EVENT_KINDS.preferences_updated,
  EVENT_KINDS.subscription_changed,
]);

// ─── profiles ──────────────────────────────────────────────────────────────

export const profileSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  locale: z.string().default('EN'),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const profileInsertSchema = profileSchema
  .omit({ created_at: true, updated_at: true })
  .extend({
    display_name: z.string().nullable().optional(),
    locale: z.string().default('EN').optional(),
  });

// ─── preferences ───────────────────────────────────────────────────────────

export const weightUnitEnum = z.enum(['kg', 'lb']);
export const volumeUnitEnum = z.enum(['ml', 'oz']);

export const preferencesSchema = z.object({
  user_id: z.string().uuid(),
  notifications_enabled: z.boolean().default(false),
  theme: themeEnum.default('dark'),
  daily_calorie_goal: z.number().int().positive().nullable(),
  // v3 (MFP-tier) — water + weight sub-mini-apps
  water_goal_ml: z.number().int().positive().default(2500),
  weight_goal_kg: z.number().positive().nullable().default(null),
  weight_unit: weightUnitEnum.default('kg'),
  volume_unit: volumeUnitEnum.default('ml'),
  updated_at: z.string().datetime({ offset: true }),
});

export const preferencesInsertSchema = preferencesSchema
  .omit({ updated_at: true })
  .extend({
    notifications_enabled: z.boolean().default(false).optional(),
    theme: themeEnum.default('dark').optional(),
    daily_calorie_goal: z.number().int().positive().nullable().optional(),
    water_goal_ml: z.number().int().positive().optional(),
    weight_goal_kg: z.number().positive().nullable().optional(),
    weight_unit: weightUnitEnum.optional(),
    volume_unit: volumeUnitEnum.optional(),
  });

// ─── subscriptions ─────────────────────────────────────────────────────────

export const subscriptionSchema = z.object({
  user_id: z.string().uuid(),
  stripe_customer_id: z.string(),
  stripe_subscription_id: z.string().nullable(),
  status: subscriptionStatusEnum,
  current_period_end: z.string().datetime({ offset: true }).nullable(),
  cancel_at_period_end: z.boolean().default(false),
  updated_at: z.string().datetime({ offset: true }),
});

export const subscriptionInsertSchema = subscriptionSchema
  .omit({ updated_at: true })
  .extend({
    stripe_subscription_id: z.string().nullable().optional(),
    current_period_end: z.string().datetime({ offset: true }).nullable().optional(),
    cancel_at_period_end: z.boolean().default(false).optional(),
  });

// ─── events ────────────────────────────────────────────────────────────────

export const eventSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  kind: z.string(), // stored as text — validated in app code against eventKindSchema
  payload: z.unknown(), // jsonb — shape varies per kind
  created_at: z.string().datetime({ offset: true }),
});

export const eventInsertSchema = eventSchema
  .omit({ id: true, created_at: true })
  .extend({
    kind: eventKindSchema,
  });

// ─── app_calorie_entries ───────────────────────────────────────────────────

export const calorieEntrySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  entered_at: z.string().datetime({ offset: true }),
  meal: mealEnum,
  raw_input: z.string().nullable(),
  kcal: z.number().int().nonnegative(),
  protein_g: z.number().int().nonnegative().default(0),
  carbs_g: z.number().int().nonnegative().default(0),
  fat_g: z.number().int().nonnegative().default(0),
  // v3 (MFP-tier) extended nutrition
  fiber_g: z.number().nonnegative().default(0),
  sugar_g: z.number().nonnegative().default(0),
  sodium_mg: z.number().nonnegative().default(0),
  cholesterol_mg: z.number().nonnegative().default(0),
  food_id: z.string().nullable().optional(),
  custom_food_id: z.string().uuid().nullable().optional(),
  serving_qty: z.number().nullable().optional(),
  serving_unit: z.string().nullable().optional(),
});

export const calorieEntryInsertSchema = calorieEntrySchema
  .omit({ id: true, entered_at: true })
  .extend({
    raw_input: z.string().nullable().optional(),
    protein_g: z.number().nonnegative().default(0).optional(),
    carbs_g: z.number().nonnegative().default(0).optional(),
    fat_g: z.number().nonnegative().default(0).optional(),
    fiber_g: z.number().nonnegative().default(0).optional(),
    sugar_g: z.number().nonnegative().default(0).optional(),
    sodium_mg: z.number().nonnegative().default(0).optional(),
    cholesterol_mg: z.number().nonnegative().default(0).optional(),
  });

// ─── v3 MFP-tier calorie schemas ───────────────────────────────────────────

const nutritionFieldsSchema = z.object({
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative().default(0),
  sugar_g: z.number().nonnegative().default(0),
  sodium_mg: z.number().nonnegative().default(0),
  cholesterol_mg: z.number().nonnegative().default(0),
});

export const foodCategoryEnum = z.enum([
  'protein', 'grain', 'veg', 'fruit', 'dairy', 'fat', 'sweet', 'drink',
]);

export const foodSchema = nutritionFieldsSchema.extend({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  serving_g: z.number().positive(),
  serving_label: z.string(),
  category: foodCategoryEnum.nullable(),
});

export const customFoodSchema = nutritionFieldsSchema.extend({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  brand: z.string().nullable(),
  serving_g: z.number().positive(),
  serving_label: z.string(),
  created_at: z.string().datetime({ offset: true }),
});

export const customFoodInsertSchema = customFoodSchema
  .omit({ id: true, user_id: true, created_at: true })
  .extend({
    brand: z.string().nullable().optional(),
    serving_label: z.string().default('100 g'),
    fiber_g: z.number().nonnegative().default(0).optional(),
    sugar_g: z.number().nonnegative().default(0).optional(),
    sodium_mg: z.number().nonnegative().default(0).optional(),
    cholesterol_mg: z.number().nonnegative().default(0).optional(),
  });

export const mealComponentSchema = z.object({
  food_id: z.string().nullable().optional(),
  custom_food_id: z.string().uuid().nullable().optional(),
  name_snapshot: z.string(),
  qty_g: z.number().positive(),
});

export const customMealSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  meal_slot: mealEnum.nullable(),
  components: z.array(mealComponentSchema),
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const customMealInsertSchema = customMealSchema
  .omit({ id: true, user_id: true, created_at: true, updated_at: true })
  .extend({
    meal_slot: mealEnum.nullable().optional(),
  });

export const weightEntrySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  weight_kg: z.number().min(20).max(400),
  note: z.string().nullable(),
  entered_at: z.string().datetime({ offset: true }),
});

export const weightEntryInsertSchema = weightEntrySchema
  .omit({ id: true, user_id: true, entered_at: true })
  .extend({
    note: z.string().nullable().optional(),
  });

export const waterEntrySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  ml: z.number().int().min(1).max(4999),
  entered_at: z.string().datetime({ offset: true }),
});

export const waterEntryInsertSchema = waterEntrySchema
  .omit({ id: true, user_id: true, entered_at: true });

export const macroGoalPctSchema = z.object({
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
}).refine(
  (v) => Math.abs(v.protein + v.carbs + v.fat - 100) < 0.5,
  { message: 'macro percentages must sum to 100' },
);

// ─── Inferred TS types ─────────────────────────────────────────────────────

export type Profile = z.infer<typeof profileSchema>;
export type ProfileInsert = z.infer<typeof profileInsertSchema>;

export type Preferences = z.infer<typeof preferencesSchema>;
export type PreferencesInsert = z.infer<typeof preferencesInsertSchema>;

export type Subscription = z.infer<typeof subscriptionSchema>;
export type SubscriptionInsert = z.infer<typeof subscriptionInsertSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusEnum>;

export type Event = z.infer<typeof eventSchema>;
export type EventInsert = z.infer<typeof eventInsertSchema>;

export type CalorieEntry = z.infer<typeof calorieEntrySchema>;
export type CalorieEntryInsert = z.infer<typeof calorieEntryInsertSchema>;
export type Meal = z.infer<typeof mealEnum>;
export type Theme = z.infer<typeof themeEnum>;
export type WeightUnit = z.infer<typeof weightUnitEnum>;
export type VolumeUnit = z.infer<typeof volumeUnitEnum>;

// v3 MFP-tier
export type FoodCategory = z.infer<typeof foodCategoryEnum>;
export type Food = z.infer<typeof foodSchema>;
export type CustomFood = z.infer<typeof customFoodSchema>;
export type CustomFoodInsert = z.infer<typeof customFoodInsertSchema>;
export type MealComponent = z.infer<typeof mealComponentSchema>;
export type CustomMeal = z.infer<typeof customMealSchema>;
export type CustomMealInsert = z.infer<typeof customMealInsertSchema>;
export type WeightEntry = z.infer<typeof weightEntrySchema>;
export type WeightEntryInsert = z.infer<typeof weightEntryInsertSchema>;
export type WaterEntry = z.infer<typeof waterEntrySchema>;
export type WaterEntryInsert = z.infer<typeof waterEntryInsertSchema>;
export type MacroGoalPct = z.infer<typeof macroGoalPctSchema>;

// ─── Gym: exercises (reference data — public read for authenticated) ───────

export const bodyPartEnum = z.enum([
  'back',
  'cardio',
  'chest',
  'lower arms',
  'lower legs',
  'neck',
  'shoulders',
  'upper arms',
  'upper legs',
  'waist',
]);

export const exerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  body_part: bodyPartEnum,
  target: z.string(),
  equipment: z.string(),
  muscle_group: z.string(),
  secondary_muscles: z.array(z.string()).default([]),
  instruction_steps: z.array(z.string()).default([]),
  image_url: z.string().url(),
  gif_url: z.string().url(),
  attribution: z.string().default('© Gym visual — https://gymvisual.com/'),
});

// ─── Gym: workout_routines (user-owned) ────────────────────────────────────

// A planned set inside a routine — reps required, weight optional (bodyweight
// exercises have no weight). Weights stored in kg for storage sanity; UI can
// convert to lb via `preferences` if we ever expose a unit toggle.
export const routineSetSchema = z.object({
  reps: z.number().int().nonnegative().max(999),
  weight_kg: z.number().nonnegative().max(1000).nullable().optional(),
});

export const routineExerciseSchema = z.object({
  exercise_id: z.string(),
  sets: z.array(routineSetSchema).max(20),
});

export const workoutRoutineSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  exercises: z.array(routineExerciseSchema).default([]),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const workoutRoutineInsertSchema = workoutRoutineSchema
  .omit({ id: true, user_id: true, created_at: true, updated_at: true })
  .extend({
    exercises: z.array(routineExerciseSchema).default([]).optional(),
  });

export const workoutRoutineUpdateSchema = workoutRoutineInsertSchema.partial();

// ─── Gym: workout_sessions (live/completed) ────────────────────────────────

// A logged set — reps + weight + completion timestamp. `completed_at = null`
// means the set is planned but not yet done in the live session UI.
export const sessionSetSchema = z.object({
  reps: z.number().int().nonnegative().max(999),
  weight_kg: z.number().nonnegative().max(1000).nullable().optional(),
  completed_at: z.string().datetime({ offset: true }).nullable().optional(),
});

// `name` is a snapshot of the exercise name — captured at session-start so a
// later rename in the exercises catalog (unlikely — public reference) doesn't
// silently rewrite historical sessions.
export const sessionEntrySchema = z.object({
  exercise_id: z.string(),
  name: z.string(),
  sets: z.array(sessionSetSchema).max(20),
});

export const workoutSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  routine_id: z.string().uuid().nullable(),
  name: z.string().max(120).nullable(),
  started_at: z.string().datetime({ offset: true }),
  ended_at: z.string().datetime({ offset: true }).nullable(),
  entries: z.array(sessionEntrySchema).default([]),
  created_at: z.string().datetime({ offset: true }),
});

export const workoutSessionInsertSchema = z
  .object({
    routine_id: z.string().uuid().nullable().optional(),
    name: z.string().min(1).max(120).nullable().optional(),
    entries: z.array(sessionEntrySchema).default([]).optional(),
  })
  .strict();

export const workoutSessionUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).nullable().optional(),
    entries: z.array(sessionEntrySchema).optional(),
    // Client may explicitly end the session by sending `end: true`. Server
    // ignores any client `ended_at` and stamps `now()` — the flag is the
    // signal, not a client-provided timestamp.
    end: z.boolean().optional(),
  })
  .strict();

// ─── Gym: inferred TS types ────────────────────────────────────────────────

export type BodyPart = z.infer<typeof bodyPartEnum>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type RoutineSet = z.infer<typeof routineSetSchema>;
export type RoutineExercise = z.infer<typeof routineExerciseSchema>;
export type WorkoutRoutine = z.infer<typeof workoutRoutineSchema>;
export type WorkoutRoutineInsert = z.infer<typeof workoutRoutineInsertSchema>;
export type WorkoutRoutineUpdate = z.infer<typeof workoutRoutineUpdateSchema>;
export type SessionSet = z.infer<typeof sessionSetSchema>;
export type SessionEntry = z.infer<typeof sessionEntrySchema>;
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;
export type WorkoutSessionInsert = z.infer<typeof workoutSessionInsertSchema>;
export type WorkoutSessionUpdate = z.infer<typeof workoutSessionUpdateSchema>;

// ─── pomodoro_sessions ─────────────────────────────────────────────────────

export const pomodoroPhaseEnum = z.enum(['work', 'short_break', 'long_break']);

export const pomodoroSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  phase: pomodoroPhaseEnum,
  planned_duration_seconds: z.number().int().positive(),
  actual_duration_seconds: z.number().int().nonnegative(),
  completed: z.boolean().default(true),
  started_at: z.string().datetime({ offset: true }),
  ended_at: z.string().datetime({ offset: true }),
});

export const newPomodoroSessionSchema = pomodoroSessionSchema
  .omit({ id: true, started_at: true, ended_at: true })
  .extend({
    completed: z.boolean().default(true).optional(),
    started_at: z.string().datetime({ offset: true }).optional(),
    ended_at: z.string().datetime({ offset: true }).optional(),
  });

// PascalCase aliases so callers can `import { PomodoroSessionSchema }` if
// they prefer that style; the camelCase names above are the canonical form
// matching the rest of this file.
export const PomodoroSessionSchema = pomodoroSessionSchema;
export const NewPomodoroSessionSchema = newPomodoroSessionSchema;

export type PomodoroPhase = z.infer<typeof pomodoroPhaseEnum>;
export type PomodoroSession = z.infer<typeof pomodoroSessionSchema>;
export type NewPomodoroSession = z.infer<typeof newPomodoroSessionSchema>;
