/**
 * toggle_reminder — pause/resume a reminder without deleting the schedule.
 * A write, so it goes through the write-budget gate.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkIdempotency, computeIdempotencyKey, insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

const inputSchema = z.object({
  reminder_id: z.string().uuid(),
  active: z.boolean(),
});

type Input = z.infer<typeof inputSchema>;

export interface ToggleReminderResult {
  ok: true;
  summary: string;
  data: { reminder_id: string; active: boolean };
}
export interface ToolError { ok: false; error: string }

export function makeToggleReminderTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      'Pause or resume a reminder. Use active=false to pause (won\'t fire), active=true to resume.',
    inputSchema,
    async execute(input: Input): Promise<ToggleReminderResult | ToolError> {
      const idempotencyKey = computeIdempotencyKey('toggle_reminder', input, userId);
      const auditBase = { supabase, userId, toolName: 'toggle_reminder', input, idempotencyKey } as const;

      const prior = await checkIdempotency(supabase, userId, idempotencyKey);
      if (prior.hit && prior.output && typeof prior.output === 'object' && 'ok' in prior.output) {
        return prior.output as ToggleReminderResult;
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
          .from('reminders')
          .update({ active: input.active })
          .eq('id', input.reminder_id)
          .eq('user_id', userId)
          .select('id')
          .maybeSingle();
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        if (!data) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: 'not_found' });
          return { ok: false, error: 'reminder_not_found' };
        }
        const output: ToggleReminderResult = {
          ok: true,
          summary: `Reminder ${input.active ? 'resumed' : 'paused'}.`,
          data: { reminder_id: input.reminder_id, active: input.active },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'toggle_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
