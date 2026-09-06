/**
 * update_gym_routine — patch a coach-grade v2 routine in place.
 *
 * Same write-gate + audit stack as create_gym_routine. The tool accepts
 * `routine_id` plus any subset of the RoutineV2 fields (name, plan, source,
 * athlete, parsing_notes). We validate `plan` strictly against `planSchema`
 * when supplied — the DB column is jsonb so a broken shape would happily
 * persist and only surface later in the renderer.
 *
 * Prefer this over asking the user to open the editor when the request is a
 * targeted tweak ("swap incline press for machine press on day 2", "add a
 * fourth set to leg curl"). Full rewrites should still go through
 * create_gym_routine on a new row.
 */
import { tool } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  planSchema,
  routineAthleteSchema,
  routineSourceSchema,
} from '@nothing/shared';
import { checkIdempotency, computeIdempotencyKey, insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

export interface UpdateGymRoutineResult {
  ok: true;
  summary: string;
  data: {
    routine_id: string;
    fields_updated: string[];
  };
}
export interface ToolError { ok: false; error: string }

const inputSchema = z.object({
  routine_id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  plan: planSchema.optional(),
  source: routineSourceSchema.nullable().optional(),
  athlete: routineAthleteSchema.nullable().optional(),
  parsing_notes: z.array(z.string().max(1000)).max(50).optional(),
});

type Input = z.infer<typeof inputSchema>;

const DESCRIPTION = [
  'Update an existing coach-grade v2 gym routine in place.',
  'Provide routine_id + any subset of fields to patch: name, plan (full RoutineV2 plan shape), source, athlete, parsing_notes.',
  'When editing exercises, sets, or reps you MUST send the entire updated `plan` object — Postgres jsonb has no partial-merge semantics on nested arrays, so a partial plan would drop unspecified days/exercises.',
  'Fetch the current plan with get_gym_routine first, mutate the copy, then send the whole thing back.',
].join(' ');

export function makeUpdateGymRoutineTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description: DESCRIPTION,
    inputSchema,
    async execute(input: Input): Promise<UpdateGymRoutineResult | ToolError> {
      const idempotencyKey = computeIdempotencyKey('update_gym_routine', input, userId);
      const auditBase = { supabase, userId, toolName: 'update_gym_routine', input, idempotencyKey } as const;

      const prior = await checkIdempotency(supabase, userId, idempotencyKey);
      if (prior.hit && prior.output && typeof prior.output === 'object' && 'ok' in prior.output) {
        return prior.output as UpdateGymRoutineResult;
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

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.plan !== undefined) {
        patch.plan = input.plan;
        // Any plan write is v2 by definition — stamp schema_version so
        // downstream renderers don't fall back to v1.
        patch.schema_version = '1.0';
      }
      if (input.source !== undefined) patch.source = input.source;
      if (input.athlete !== undefined) patch.athlete = input.athlete;
      if (input.parsing_notes !== undefined) patch.parsing_notes = input.parsing_notes;

      if (Object.keys(patch).length === 0) {
        const msg = 'empty_patch';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: msg });
        return { ok: false, error: msg };
      }

      try {
        const { data, error } = await supabase
          .from('workout_routines')
          .update(patch)
          .eq('id', input.routine_id)
          .eq('user_id', userId)
          .select('id, name, plan')
          .maybeSingle();
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        if (!data) {
          const msg = 'not_found';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: msg });
          return { ok: false, error: msg };
        }
        const output: UpdateGymRoutineResult = {
          ok: true,
          summary: `Updated routine "${data.name as string}" (${Object.keys(patch).join(', ')}).`,
          data: {
            routine_id: data.id as string,
            fields_updated: Object.keys(patch),
          },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'update_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
