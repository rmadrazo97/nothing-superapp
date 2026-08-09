/**
 * list_gym_routines — compact roll-up of the user's saved routines.
 * Read-only; RLS restricts to owner. Returns id + name + schema_version +
 * day_count (0 for v1 rows) + exercise_count + created_at so the LLM can
 * pick which one to fetch in full via `get_gym_routine`.
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
    .max(50)
    .default(20)
    .describe('Max routines to return (default 20, cap 50).'),
});

type Input = z.infer<typeof inputSchema>;

interface RoutineSummary {
  id: string;
  name: string;
  schema_version: string | null;
  day_count: number;
  exercise_count: number;
  updated_at: string;
  created_at: string;
}

export interface ListGymRoutinesResult {
  ok: true;
  summary: string;
  data: { routines: RoutineSummary[] };
}
export interface ToolError { ok: false; error: string }

export function makeListGymRoutinesTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "List the user's saved gym routines with lightweight metadata (id, name, schema_version, day_count, exercise_count, timestamps). Use this before `get_gym_routine` when the user asks 'what routines do I have?'",
    inputSchema,
    async execute(input: Input): Promise<ListGymRoutinesResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'list_gym_routines', input } as const;
      try {
        const { data, error } = await supabase
          .from('workout_routines')
          .select('id, name, schema_version, exercises, plan, created_at, updated_at')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(input.limit);
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        const routines: RoutineSummary[] = (data ?? []).map((row) => {
          const r = row as {
            id: string;
            name: string;
            schema_version: string | null;
            exercises: unknown;
            plan: { days?: Array<{ exercises?: unknown[] }> } | null;
            created_at: string;
            updated_at: string;
          };
          const isV2 = r.plan != null && Array.isArray(r.plan.days);
          const dayCount = isV2 ? r.plan!.days!.length : 0;
          const exerciseCount = isV2
            ? r.plan!.days!.reduce(
                (n, d) => n + (Array.isArray(d.exercises) ? d.exercises.length : 0),
                0,
              )
            : Array.isArray(r.exercises)
              ? (r.exercises as unknown[]).length
              : 0;
          return {
            id: r.id,
            name: r.name,
            schema_version: r.schema_version,
            day_count: dayCount,
            exercise_count: exerciseCount,
            updated_at: r.updated_at,
            created_at: r.created_at,
          };
        });
        const output: ListGymRoutinesResult = {
          ok: true,
          summary: `${routines.length} routine${routines.length === 1 ? '' : 's'}.`,
          data: { routines },
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
