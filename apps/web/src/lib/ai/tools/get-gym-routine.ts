/**
 * get_gym_routine — return a single routine (v1 or v2) belonging to the
 * current user. Read-only, so skips the write-budget gate. RLS on
 * `workout_routines` still enforces owner-scoping.
 *
 * Lookup priority: `routine_id` (uuid) > `name` (case-insensitive substring)
 * > most-recently-updated routine.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const inputSchema = z
  .object({
    routine_id: z.string().uuid().optional().describe('Exact uuid of the routine to fetch.'),
    name: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('Case-insensitive substring of the routine name — used when no id.'),
    active_only: z
      .boolean()
      .default(false)
      .describe('Reserved — v2 routines will grow an active flag later.'),
    summary_only: z
      .boolean()
      .default(false)
      .describe(
        'If true, omit the full plan blob and return only day names + focus + exercise counts.',
      ),
  })
  .describe(
    'Fetch one gym routine. Provide routine_id or name; if neither is given, returns the most-recently-updated routine.',
  );

type Input = z.infer<typeof inputSchema>;

interface RoutineRow {
  id: string;
  name: string;
  schema_version: string | null;
  exercises: unknown;
  plan: unknown;
  source: unknown;
  athlete: unknown;
  parsing_notes: string[] | null;
  updated_at: string;
}

export interface GetGymRoutineResult {
  ok: true;
  summary: string;
  data: {
    routine: RoutineRow | Record<string, unknown>;
  };
}
export interface ToolError { ok: false; error: string }

const SELECT =
  'id, name, schema_version, exercises, plan, source, athlete, parsing_notes, updated_at';

export function makeGetGymRoutineTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Fetch one of the user's gym routines. Prefer routine_id; else name substring; else falls back to the most recent. Set summary_only=true to skip the full plan blob and just get day names + focus + counts.",
    inputSchema,
    async execute(input: Input): Promise<GetGymRoutineResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'get_gym_routine', input } as const;
      try {
        let query = supabase
          .from('workout_routines')
          .select(SELECT)
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (input.routine_id) {
          query = query.eq('id', input.routine_id);
        } else if (input.name) {
          query = query.ilike('name', `%${input.name}%`);
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        if (!data) {
          const err = 'not_found';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: err });
          return { ok: false, error: err };
        }

        const row = data as RoutineRow;
        const plan = row.plan as { days?: Array<{ day: number; name_en?: string; name_es?: string; focus?: string[]; exercises?: unknown[] }> } | null;
        const isV2 = plan != null && Array.isArray(plan.days) && plan.days.length > 0;

        const summary = isV2
          ? `Routine "${row.name}" — v2, ${plan!.days!.length} day${plan!.days!.length === 1 ? '' : 's'}.`
          : `Routine "${row.name}" — v1 (flat).`;

        let payload: RoutineRow | Record<string, unknown> = row;
        if (input.summary_only && isV2) {
          payload = {
            id: row.id,
            name: row.name,
            schema_version: row.schema_version,
            updated_at: row.updated_at,
            day_summaries: plan!.days!.map((d) => ({
              day: d.day,
              name: d.name_en ?? d.name_es ?? `Day ${d.day}`,
              focus: d.focus ?? [],
              exercise_count: Array.isArray(d.exercises) ? d.exercises.length : 0,
            })),
          };
        }

        const output: GetGymRoutineResult = {
          ok: true,
          summary,
          data: { routine: payload },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'fetch_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
