/**
 * get_gym_history — last N workout sessions (default 5, cap 20). Returns
 * a compact rollup — id, name, started_at, ended_at, exercise_count,
 * total_sets — plus per-exercise names so the LLM can answer "what did I
 * hit last leg day" without pulling every set into context.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Max sessions to return (default 5, cap 20).'),
});

type Input = z.infer<typeof inputSchema>;

interface HistoryRow {
  id: string;
  name: string | null;
  started_at: string;
  ended_at: string | null;
  exercise_count: number;
  total_sets: number;
  exercises: string[];
}

export interface GymHistoryResult {
  ok: true;
  summary: string;
  data: { sessions: HistoryRow[] };
}

export interface ToolError { ok: false; error: string }

export function makeGetGymHistoryTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Get the user's most recent workout sessions (id, name, timestamps, exercise names, set count). Use when asked about past workouts, PRs, or leg/push/pull history.",
    inputSchema,
    async execute(input: Input): Promise<GymHistoryResult | ToolError> {
      try {
        const { data, error } = await supabase
          .from('workout_sessions')
          .select('id, name, started_at, ended_at, entries')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(input.limit);
        if (error) {
          await insertToolAudit({
            supabase, userId, toolName: 'get_gym_history',
            input, status: 'error', errorMessage: error.message,
          });
          return { ok: false, error: 'db_error' };
        }
        const sessions: HistoryRow[] = (data ?? []).map((row) => {
          const r = row as {
            id: string; name: string | null;
            started_at: string; ended_at: string | null;
            entries: Array<{ name?: string; sets?: unknown[] }> | null;
          };
          const entries = Array.isArray(r.entries) ? r.entries : [];
          const totalSets = entries.reduce(
            (acc, e) => acc + (Array.isArray(e.sets) ? e.sets.length : 0),
            0,
          );
          return {
            id: r.id,
            name: r.name,
            started_at: r.started_at,
            ended_at: r.ended_at,
            exercise_count: entries.length,
            total_sets: totalSets,
            exercises: entries.map((e) => e.name ?? '(unnamed)'),
          };
        });
        const output: GymHistoryResult = {
          ok: true,
          summary: `Last ${sessions.length} workout session${sessions.length === 1 ? '' : 's'}.`,
          data: { sessions },
        };
        await insertToolAudit({
          supabase, userId, toolName: 'get_gym_history',
          input, output, status: 'ok',
        });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'history_failed';
        await insertToolAudit({
          supabase, userId, toolName: 'get_gym_history',
          input, status: 'error', errorMessage: message,
        });
        return { ok: false, error: message };
      }
    },
  });
}
