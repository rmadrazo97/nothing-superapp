import { z } from 'zod';

// v2 gym routine schemas (add-only re-export — see ./gym.ts for the shape)
export * from './gym.ts';

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

// Wave 2-A (onboarding wizard) — body profile enums. All three are stored on
// `preferences` as nullable text so existing users aren't broken; the wizard
// populates them on first run and `onboarded_at` records that we asked.
export const sexEnum = z.enum(['male', 'female', 'other']);
export const activityLevelEnum = z.enum([
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
]);
export const goalDirectionEnum = z.enum(['lose', 'maintain', 'gain']);

// v0.3.2 (Web Push) — allow-list of broadcast topics the user opts into.
// Kept as a plain string enum so DB text[] round-trips cleanly. New topics
// should be added here first so type-narrowing keeps API validation honest.
export const pushTopicEnum = z.enum(['releases', 'insights']);

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
  // Wave 2-A onboarding profile — all nullable until the wizard runs.
  sex: sexEnum.nullable().default(null),
  age_years: z.number().int().positive().max(129).nullable().default(null),
  height_cm: z.number().positive().min(50).max(260).nullable().default(null),
  activity_level: activityLevelEnum.nullable().default(null),
  goal_direction: goalDirectionEnum.nullable().default(null),
  onboarded_at: z.string().datetime({ offset: true }).nullable().default(null),
  // v0.3.2 Web Push — device-level opt-in flag + topic allow-list. The
  // browser permission is authoritative for delivery; these are how we
  // remember the account-level intent + which broadcasts to fan out to.
  push_enabled: z.boolean().default(false),
  push_topics: z.array(pushTopicEnum).default(['releases']),
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
    sex: sexEnum.nullable().optional(),
    age_years: z.number().int().positive().max(129).nullable().optional(),
    height_cm: z.number().positive().min(50).max(260).nullable().optional(),
    activity_level: activityLevelEnum.nullable().optional(),
    goal_direction: goalDirectionEnum.nullable().optional(),
    onboarded_at: z.string().datetime({ offset: true }).nullable().optional(),
    push_enabled: z.boolean().optional(),
    push_topics: z.array(pushTopicEnum).optional(),
  });

// ─── push_subscriptions (v0.3.2 Web Push) ──────────────────────────────────
// The client sends the browser's `PushSubscription.toJSON()` shape, which
// nests the crypto keys under `.keys`. We accept that shape at the API
// boundary and flatten to columns server-side (endpoint, p256dh, auth).

export const pushSubscriptionJsonSchema = z.object({
  endpoint: z.string().url().max(2000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export const pushSubscriptionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string(),
  user_agent: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  last_seen_at: z.string().datetime({ offset: true }),
});

export const pushSubscriptionInsertSchema = pushSubscriptionSchema
  .omit({ id: true, created_at: true, last_seen_at: true })
  .extend({
    user_agent: z.string().nullable().optional(),
  });

export type PushTopic = z.infer<typeof pushTopicEnum>;
export type PushSubscriptionJson = z.infer<typeof pushSubscriptionJsonSchema>;
export type PushSubscriptionRow = z.infer<typeof pushSubscriptionSchema>;
export type PushSubscriptionInsert = z.infer<typeof pushSubscriptionInsertSchema>;

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

// ─── food_favorites (v3 MFP-tier Wave 2-B) ─────────────────────────────────
// Exactly one of `food_id` (public catalog) or `custom_food_id` (user's own
// custom food) must be set. Server enforces via DB CHECK constraints; the
// `.refine` here mirrors that so client-side validation never sends a broken
// row over the wire.

export const foodFavoriteSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  food_id: z.string().max(120).nullable().optional(),
  custom_food_id: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime({ offset: true }),
});

export const foodFavoriteInsertSchema = z
  .object({
    food_id: z.string().max(120).nullable().optional(),
    custom_food_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (v) => {
      const hasPublic = v.food_id != null && v.food_id !== '';
      const hasCustom = v.custom_food_id != null && v.custom_food_id !== '';
      return hasPublic !== hasCustom; // XOR — exactly one target
    },
    { message: 'exactly one of food_id or custom_food_id must be set' },
  );

export type FoodFavorite = z.infer<typeof foodFavoriteSchema>;
export type FoodFavoriteInsert = z.infer<typeof foodFavoriteInsertSchema>;

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
export type Sex = z.infer<typeof sexEnum>;
export type ActivityLevel = z.infer<typeof activityLevelEnum>;
export type GoalDirection = z.infer<typeof goalDirectionEnum>;

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
  // v2 columns (added in migration 011 — optional on the shared row so v1
  // consumers still parse older rows). Full v2 shape validation happens in
  // ./gym.ts (routineV2Schema); here we keep them permissive so a client
  // hydrating any row won't reject on a stricter renderer's payload.
  schema_version: z.string().nullable().optional(),
  plan: z.unknown().nullable().optional(),
  source: z.unknown().nullable().optional(),
  athlete: z.unknown().nullable().optional(),
  parsing_notes: z.array(z.string()).nullable().optional(),
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
  // v2 (migration 011) — optional back-refs into the plan the session
  // was started from. All nullable so v1 sessions still parse.
  plan_day: z.number().int().nullable().optional(),
  plan_exercise_id: z.string().max(40).nullable().optional(),
  block_role: z.enum(['top_set', 'backoff', 'straight', 'superset']).nullable().optional(),
  created_at: z.string().datetime({ offset: true }),
});

export const workoutSessionInsertSchema = z
  .object({
    routine_id: z.string().uuid().nullable().optional(),
    name: z.string().min(1).max(120).nullable().optional(),
    entries: z.array(sessionEntrySchema).default([]).optional(),
    plan_day: z.number().int().positive().max(14).nullable().optional(),
    plan_exercise_id: z.string().max(40).nullable().optional(),
    block_role: z.enum(['top_set', 'backoff', 'straight', 'superset']).nullable().optional(),
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

// ─── copilot_tool_calls (v0.4 — copilot agent audit log) ──────────────────
// One row per tool invocation. `input` and `output` are jsonb blobs whose
// shape varies per tool. `status` is text (not enum) so new statuses like
// 'rate_limited' can be added without a migration.

export const copilotToolCallStatusEnum = z.enum([
  'ok',
  'error',
  'rate_limited',
  'unauthorized',
  'payment_required',
]);

export const copilotToolCallSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  tool_name: z.string().min(1).max(120),
  input: z.unknown(),
  output: z.unknown().nullable(),
  status: copilotToolCallStatusEnum,
  error_message: z.string().nullable(),
  called_at: z.string().datetime({ offset: true }),
});

export const copilotToolCallInsertSchema = copilotToolCallSchema
  .omit({ id: true, called_at: true })
  .extend({
    output: z.unknown().nullable().optional(),
    status: copilotToolCallStatusEnum.default('ok').optional(),
    error_message: z.string().nullable().optional(),
  });

export type CopilotToolCallStatus = z.infer<typeof copilotToolCallStatusEnum>;
export type CopilotToolCall = z.infer<typeof copilotToolCallSchema>;
export type CopilotToolCallInsert = z.infer<typeof copilotToolCallInsertSchema>;

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
