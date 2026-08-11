/**
 * Habits mini-app schemas (migration 032).
 *
 * Two-table model:
 *   - `habits`             — user's habit definitions (name, optional emoji,
 *                             target days/week, active flag).
 *   - `habit_completions`  — one row per habit per completed date. Unique
 *                             `(habit_id, completed_on)` — checking a habit
 *                             twice on the same day is a no-op.
 *
 * The client toggles today's checkbox by POSTing `{ habit_id }` to the
 * completions endpoint; the server inserts on absent, deletes on present
 * (idempotent toggle). Streak = consecutive prior days completed, walked
 * backward from today on the client from the completions list.
 *
 * Types are Zod-inferred so shared/DB drift is impossible.
 */
import { z } from 'zod';

// ─── habits ───────────────────────────────────────────────────────────────

export const habitSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  // Optional 1–2 char row emoji. Kept small so the launcher / list rows
  // can render it inline without wrapping.
  emoji: z.string().max(8).nullable().optional(),
  target_days_per_week: z.number().int().min(1).max(7).default(7),
  active: z.boolean().default(true),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const habitInsertSchema = z
  .object({
    name: z.string().min(1).max(80),
    emoji: z.string().max(8).nullable().optional(),
    target_days_per_week: z.number().int().min(1).max(7).default(7).optional(),
    active: z.boolean().default(true).optional(),
  })
  .strict();

export const habitUpdateSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    emoji: z.string().max(8).nullable().optional(),
    target_days_per_week: z.number().int().min(1).max(7).optional(),
    active: z.boolean().optional(),
  })
  .strict();

// ─── habit_completions ────────────────────────────────────────────────────

// Local date, no time — YYYY-MM-DD. Server clamps to a sensible range on
// insert (see the API route). The regex here is intentionally strict so a
// malformed client string can never round-trip into the DB.
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'completed_on must be YYYY-MM-DD.');

export const habitCompletionSchema = z.object({
  id: z.string().uuid(),
  habit_id: z.string().uuid(),
  user_id: z.string().uuid(),
  completed_on: localDate,
  created_at: z.string().datetime({ offset: true }),
});

// Toggle body: client sends the habit_id + optionally the local date. The
// server derives today's date if `completed_on` is omitted so the common
// path is "tap = toggle today".
export const habitCompletionToggleSchema = z
  .object({
    habit_id: z.string().uuid(),
    completed_on: localDate.optional(),
  })
  .strict();

// ─── inferred types ───────────────────────────────────────────────────────

export type Habit = z.infer<typeof habitSchema>;
export type HabitInsert = z.infer<typeof habitInsertSchema>;
export type HabitUpdate = z.infer<typeof habitUpdateSchema>;
export type HabitCompletion = z.infer<typeof habitCompletionSchema>;
export type HabitCompletionToggle = z.infer<typeof habitCompletionToggleSchema>;
