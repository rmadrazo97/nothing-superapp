/**
 * trigger_reminder_now — fire a reminder immediately. Great for
 * "run my weekly review now" moments.
 *
 * For notify reminders, fires the push synchronously. For agent_loop
 * reminders, kicks the loop synchronously — the tool result includes the
 * agent's response so the copilot can weave it into the chat reply.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Reminder } from '@nothing/shared';
import { insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';
import { supabaseService } from '@/lib/supabase/service';
import { fireReminder } from '@/lib/ai/agent-loops';

const inputSchema = z.object({
  reminder_id: z.string().uuid(),
});

type Input = z.infer<typeof inputSchema>;

export interface TriggerReminderNowResult {
  ok: true;
  summary: string;
  data: {
    reminder_id: string;
    kind: 'notify' | 'agent_loop';
    status: 'ok' | 'error' | 'skipped';
    push_sent: boolean;
    agent_summary?: string;
  };
}
export interface ToolError { ok: false; error: string }

export function makeTriggerReminderNowTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Fire a reminder immediately. For notify: sends the push now. For agent_loop: runs the copilot prompt now and returns the agent's response inline. Great for 'run my weekly review now' — the user gets an instant answer + it's logged to reminder_runs.",
    inputSchema,
    async execute(input: Input): Promise<TriggerReminderNowResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'trigger_reminder_now', input } as const;
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
      // RLS-safe ownership check via caller's session client.
      const { data: row } = await supabase
        .from('reminders')
        .select('id')
        .eq('id', input.reminder_id)
        .eq('user_id', userId)
        .maybeSingle();
      if (!row) {
        return { ok: false, error: 'reminder_not_found' };
      }
      // Fire via service_role — RLS bypassed AFTER ownership was proven above.
      const svc = supabaseService();
      const { data: fresh } = await svc
        .from('reminders')
        .select('*')
        .eq('id', input.reminder_id)
        .maybeSingle();
      if (!fresh) {
        return { ok: false, error: 'reminder_not_found' };
      }
      try {
        const outcome = await fireReminder(fresh as Reminder, { agentBackground: false });
        const output: TriggerReminderNowResult = {
          ok: true,
          summary:
            outcome.kind === 'notify'
              ? `Notify fired. Push sent: ${outcome.push_sent}.`
              : `Agent loop ran. Push sent: ${outcome.push_sent}.`,
          data: outcome,
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'trigger_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
