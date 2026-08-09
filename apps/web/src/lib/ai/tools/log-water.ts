/**
 * log_water — inserts a row into water_entries. Same gate stack as
 * log_calorie_entry (entitlement + write budget). Amount in mL; server
 * enforces 1..4999 to match the DB check constraint.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

const inputSchema = z.object({
  ml: z
    .number()
    .int()
    .min(1)
    .max(4999)
    .describe('Water intake in milliliters. 250 = one glass, 500 = one bottle.'),
});

type Input = z.infer<typeof inputSchema>;

export interface LogWaterResult {
  ok: true;
  summary: string;
  data: { entry_id: string; ml: number };
}
export interface ToolError { ok: false; error: string }

export function makeLogWaterTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description: 'Log a water intake entry (in ml) for the current user.',
    inputSchema,
    async execute(input: Input): Promise<LogWaterResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'log_water', input } as const;

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
          .from('water_entries')
          .insert({ user_id: userId, ml: input.ml })
          .select('id')
          .single();
        if (error || !data) {
          const msg = error?.message ?? 'db_error';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: msg });
          return { ok: false, error: msg };
        }
        const output: LogWaterResult = {
          ok: true,
          summary: `Logged to Calorie Lite: +${input.ml}ml water.`,
          data: { entry_id: data.id as string, ml: input.ml },
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
