/**
 * create_gym_routine — insert a v2 (structured, coach-grade) workout routine
 * for the current user. Wraps the same write-gate stack as log_calorie_entry
 * (entitlement + hourly write budget) plus a full audit-log row.
 *
 * The tool's inputSchema is the full RoutineV2 shape (with an optional
 * top-level `name` override for the DB row's `name` column). The LLM is
 * expected to fill every required field — the tool description points at
 * the discriminant + range shapes.
 */
import { tool } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { routineV2InsertSchema, type RoutineV2Insert } from '@nothing/shared';
import { checkIdempotency, computeIdempotencyKey, insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

export interface CreateGymRoutineResult {
  ok: true;
  summary: string;
  data: {
    routine_id: string;
    name: string;
    day_count: number;
    exercise_count: number;
  };
}
export interface ToolError { ok: false; error: string }

const DESCRIPTION = [
  'Create a coach-grade multi-day gym routine for the current user.',
  'Provide the full RoutineV2 shape:',
  '  { schema_version: "1.0", plan: { id, days: [...] }, source?, athlete?, parsing_notes?, name? }',
  'Each `plan.days[].exercises[]` MUST include `structure` (one of "straight" | "top_set_backoff" | "superset"), `sets_total`, and `rest_seconds` ({min,max} in seconds).',
  'For "straight" / "top_set_backoff" also include `blocks: [{role, sets, reps: {min,max}, rir?: {min,max}}]` (role is "top_set" | "backoff" | "straight").',
  'For "superset" also include `rounds` and `components: [{order, name_en?, sets, reps: {min,max}, rir?}]`.',
  'Reps and RIR are ALWAYS ranges of the form {min, max}, even when the coach wrote a single number ({min: 2, max: 2}).',
  'Prefer `name_en` and `name_es` when the source was bilingual. Optional: `pattern`, `primary_muscles`, `equipment`, `unilateral`, `reps_per_side`, `alternatives`, `raw`.',
].join(' ');

export function makeCreateGymRoutineTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description: DESCRIPTION,
    inputSchema: routineV2InsertSchema,
    async execute(input: RoutineV2Insert): Promise<CreateGymRoutineResult | ToolError> {
      const idempotencyKey = computeIdempotencyKey('create_gym_routine', input, userId);
      const auditBase = { supabase, userId, toolName: 'create_gym_routine', input, idempotencyKey } as const;

      const prior = await checkIdempotency(supabase, userId, idempotencyKey);
      if (prior.hit && prior.output && typeof prior.output === 'object' && 'ok' in prior.output) {
        return prior.output as CreateGymRoutineResult;
      }

      const budget = assertWriteBudget(userId);
      if (!budget.ok) {
        await insertToolAudit({ ...auditBase, status: 'rate_limited', errorMessage: budget.error });
        return { ok: false, error: budget.error };
      }
      const gate = await assertEntitled(userId, supabase);
      if (!gate.ok) {
        await insertToolAudit({ ...auditBase, status: gate.status, errorMessage: gate.error });
        return { ok: false, error: gate.error };
      }

      const rowName =
        input.name?.trim() ||
        input.source?.title?.trim() ||
        input.plan.id;

      try {
        const { data, error } = await supabase
          .from('workout_routines')
          .insert({
            user_id: userId,
            name: rowName,
            exercises: [], // v2 routines live in `plan`
            schema_version: '1.0',
            plan: input.plan,
            source: input.source ?? null,
            athlete: input.athlete ?? null,
            parsing_notes: input.parsing_notes ?? [],
          })
          .select('id')
          .single();
        if (error || !data) {
          const msg = error?.message ?? 'db_error';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: msg });
          return { ok: false, error: msg };
        }
        const dayCount = input.plan.days.length;
        const exerciseCount = input.plan.days.reduce(
          (n, d) => n + d.exercises.length,
          0,
        );
        const output: CreateGymRoutineResult = {
          ok: true,
          summary: `Created ${dayCount}-day plan "${rowName}" (${exerciseCount} exercises).`,
          data: {
            routine_id: data.id as string,
            name: rowName,
            day_count: dayCount,
            exercise_count: exerciseCount,
          },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'create_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
