/**
 * log_weight — inserts a row into weight_entries. Weight is always stored
 * in kg; the UI converts for display. Server enforces 20 < weight_kg < 400
 * to match the DB check.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkIdempotency, computeIdempotencyKey, insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

const inputSchema = z.object({
  weight_kg: z
    .number()
    .gt(20)
    .lt(400)
    .describe('Weight in kilograms. Server-side unit — the UI converts for display.'),
  note: z.string().max(500).nullable().optional(),
});

type Input = z.infer<typeof inputSchema>;

export interface LogWeightResult {
  ok: true;
  summary: string;
  data: { entry_id: string; weight_kg: number };
}
export interface ToolError { ok: false; error: string }

export function makeLogWeightTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description: 'Log a body-weight datapoint (in kg) for the current user.',
    inputSchema,
    async execute(input: Input): Promise<LogWeightResult | ToolError> {
      const idempotencyKey = computeIdempotencyKey('log_weight', input, userId);
      const auditBase = { supabase, userId, toolName: 'log_weight', input, idempotencyKey } as const;

      const prior = await checkIdempotency(supabase, userId, idempotencyKey);
      if (prior.hit && prior.output && typeof prior.output === 'object' && 'ok' in prior.output) {
        return prior.output as LogWeightResult;
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

      try {
        const { data, error } = await supabase
          .from('weight_entries')
          .insert({
            user_id: userId,
            weight_kg: input.weight_kg,
            note: input.note ?? null,
          })
          .select('id')
          .single();
        if (error || !data) {
          const msg = error?.message ?? 'db_error';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: msg });
          return { ok: false, error: msg };
        }
        const output: LogWeightResult = {
          ok: true,
          summary: `Logged to Calorie Lite: weight ${input.weight_kg}kg.`,
          data: { entry_id: data.id as string, weight_kg: input.weight_kg },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'log_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
