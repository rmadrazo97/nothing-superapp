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

export const preferencesSchema = z.object({
  user_id: z.string().uuid(),
  notifications_enabled: z.boolean().default(false),
  theme: themeEnum.default('dark'),
  daily_calorie_goal: z.number().int().positive().nullable(),
  updated_at: z.string().datetime({ offset: true }),
});

export const preferencesInsertSchema = preferencesSchema
  .omit({ updated_at: true })
  .extend({
    notifications_enabled: z.boolean().default(false).optional(),
    theme: themeEnum.default('dark').optional(),
    daily_calorie_goal: z.number().int().positive().nullable().optional(),
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
});

export const calorieEntryInsertSchema = calorieEntrySchema
  .omit({ id: true, entered_at: true })
  .extend({
    raw_input: z.string().nullable().optional(),
    protein_g: z.number().int().nonnegative().default(0).optional(),
    carbs_g: z.number().int().nonnegative().default(0).optional(),
    fat_g: z.number().int().nonnegative().default(0).optional(),
  });

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
