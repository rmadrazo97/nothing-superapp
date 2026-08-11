/**
 * list_habits — read-only enumeration of the caller's habit definitions.
 *
 * No pagination — real users have <20 habits. The model uses this before
 * create_habit (avoid duplicating an existing habit) or before
 * toggle_habit_completion (resolve a name → habit_id).
 *
 * No write gate (read tool per _gate.ts convention).
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Habit } from '@nothing/shared';
import { insertToolAudit } from './_audit';

const inputSchema = z.object({}).strict();

type Input = z.infer<typeof inputSchema>;

export interface ListHabitsResult {
  ok: true;
  summary: string;
  data: { habits: Habit[] };
}
export interface ToolError {
  ok: false;
  error: string;
}

export function makeListHabitsTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      'List every habit the user is tracking. Use this before create_habit to avoid duplicating a habit the user already has, or before toggle_habit_completion to look up a habit_id by name.',
    inputSchema,
    async execute(input: Input): Promise<ListHabitsResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'list_habits', input } as const;
      try {
        const { data, error } = await supabase
          .from('habits')
          .select('id, user_id, name, emoji, target_days_per_week, active, created_at, updated_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true });
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        const habits = (data ?? []) as Habit[];
        const output: ListHabitsResult = {
          ok: true,
          summary: `${habits.length} habit${habits.length === 1 ? '' : 's'}.`,
          data: { habits },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'list_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
