/**
 * Journal mini-app schemas (migration 033).
 *
 * One-table model:
 *   - `journal_entries` — one row per user per (optionally back-filled)
 *     local calendar day. Body is 1..20k chars of free text; mood is an
 *     optional 5-value enum. `entered_on` is the local date the entry is
 *     FOR (not `created_at`, which is the wall-clock write time) so users
 *     can back-fill yesterday without lying about when they lived it.
 *
 * There's no uniqueness constraint on `(user_id, entered_on)` — a user
 * MAY write multiple entries for the same day (morning + evening pages).
 * The UI treats "today's entry" as the most-recently-created row for
 * `entered_on = today` and offers UPDATE rather than a second INSERT.
 *
 * Types are Zod-inferred so shared/DB drift is impossible.
 */
import { z } from 'zod';

// Local date, no time — YYYY-MM-DD. Same strict regex as habits.
const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'entered_on must be YYYY-MM-DD.');

// 5-tier mood enum. Kept small so the row chips fit on a phone width.
// Rendered with an emoji prefix at the UI layer — the DB stores the token.
export const journalMoodEnum = z.enum(['great', 'good', 'neutral', 'low', 'bad']);
export type JournalMood = z.infer<typeof journalMoodEnum>;

export const journalEntrySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  entered_on: localDate,
  mood: journalMoodEnum.nullable().optional(),
  body: z.string().min(1).max(20000),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const journalEntryInsertSchema = z
  .object({
    // Server derives today's local date if the client omits `entered_on`,
    // so the common "tap SAVE" path doesn't need to reason about timezones.
    entered_on: localDate.optional(),
    mood: journalMoodEnum.nullable().optional(),
    body: z.string().min(1).max(20000),
  })
  .strict();

export const journalEntryUpdateSchema = z
  .object({
    entered_on: localDate.optional(),
    mood: journalMoodEnum.nullable().optional(),
    body: z.string().min(1).max(20000).optional(),
  })
  .strict();

// ─── inferred types ───────────────────────────────────────────────────────

export type JournalEntry = z.infer<typeof journalEntrySchema>;
export type JournalEntryInsert = z.infer<typeof journalEntryInsertSchema>;
export type JournalEntryUpdate = z.infer<typeof journalEntryUpdateSchema>;
