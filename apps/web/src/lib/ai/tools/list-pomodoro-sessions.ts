/**
 * list_pomodoro_sessions — read-only enumeration of the caller's recent
 * pomodoro sessions, newest first.
 *
 * The framework's generated `pomodoro_sessions_list` already exists, but
 * it's clunky for the model to reach for (it needs to know the naming
 * convention, and its response shape mixes framework metadata with rows).
 * This hand-written alias keeps the copilot's read surface semantic and
 * matches the naming pattern of `list_habits`, `list_journal_entries`, etc.
 *
 * No write gate (read tool per _gate.ts convention).
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PomodoroSession } from '@nothing/shared';
import { insertToolAudit } from './_audit';

const inputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe('How many sessions to return (default 10, max 50).'),
  })
  .strict();

type Input = z.infer<typeof inputSchema>;

export interface ListPomodoroSessionsResult {
  ok: true;
  summary: string;
  data: { sessions: PomodoroSession[] };
}
export interface ToolError {
  ok: false;
  error: string;
}

export function makeListPomodoroSessionsTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "List the user's recent pomodoro sessions (work + break phases). Use to reflect on their focus patterns or find recent activity.",
    inputSchema,
    async execute(input: Input): Promise<ListPomodoroSessionsResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'list_pomodoro_sessions', input } as const;
      try {
        const { data, error } = await supabase
          .from('pomodoro_sessions')
          .select(
            'id, user_id, phase, planned_duration_seconds, actual_duration_seconds, completed, started_at, ended_at',
          )
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(input.limit);
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        const sessions = (data ?? []) as PomodoroSession[];
        const output: ListPomodoroSessionsResult = {
          ok: true,
          summary: `${sessions.length} session${sessions.length === 1 ? '' : 's'}.`,
          data: { sessions },
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
