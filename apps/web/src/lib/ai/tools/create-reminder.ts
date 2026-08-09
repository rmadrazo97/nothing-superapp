/**
 * create_reminder — semantic alias for the reminders_reminders_create tool.
 *
 * Teaches the LLM the shape of a reminder in ONE tool description so it
 * doesn't have to reason about "reminders_reminders_create + validate the
 * shape from the schema". Covers both notify and agent_loop kinds with
 * per-schedule-kind requirements spelled out.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeNextFireAt, reminderInsertSchema } from '@nothing/shared';
import { insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

type Input = z.infer<typeof reminderInsertSchema>;

export interface CreateReminderResult {
  ok: true;
  summary: string;
  data: { reminder_id: string; next_fire_at: string | null };
}
export interface ToolError {
  ok: false;
  error: string;
}

export function makeCreateReminderTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description: [
      "Create a reminder for the user. Two kinds: 'notify' (plain push at the scheduled time)",
      "and 'agent_loop' (an autonomous copilot prompt that runs on the schedule and pushes",
      'the result — set agent_task = { prompt, context?, model?, max_steps? }).',
      '',
      'Schedule shapes:',
      "  once     → schedule_at (ISO datetime)",
      "  daily    → schedule_time (HH:MM, 24h)",
      "  weekly   → schedule_time + schedule_dow[] (0=Sun..6=Sat)",
      "  monthly  → schedule_dom (1-31) + optional schedule_time",
      "  cron     → schedule_cron (raw 5- or 6-field POSIX cron)",
      '',
      "Always set timezone to the user's IANA zone (e.g. 'America/Mexico_City').",
    ].join('\n'),
    inputSchema: reminderInsertSchema,
    async execute(input: Input): Promise<CreateReminderResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'create_reminder', input } as const;

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
        const nextFireAt = computeNextFireAt(
          {
            schedule_kind: input.schedule_kind,
            schedule_at: input.schedule_at ?? null,
            schedule_time: input.schedule_time ?? null,
            schedule_dow: input.schedule_dow ?? null,
            schedule_dom: input.schedule_dom ?? null,
            schedule_cron: input.schedule_cron ?? null,
            timezone: input.timezone ?? 'UTC',
          },
          new Date(),
        );
        const { data, error } = await supabase
          .from('reminders')
          .insert({
            user_id: userId,
            title: input.title,
            notes: input.notes ?? null,
            kind: input.kind,
            schedule_kind: input.schedule_kind,
            schedule_at: input.schedule_at ?? null,
            schedule_time: input.schedule_time ?? null,
            schedule_dow: input.schedule_dow ?? null,
            schedule_dom: input.schedule_dom ?? null,
            schedule_cron: input.schedule_cron ?? null,
            timezone: input.timezone ?? 'UTC',
            agent_task: input.agent_task ?? null,
            push_topic: input.push_topic ?? 'reminders',
            active: input.active ?? true,
            next_fire_at: nextFireAt,
          })
          .select('id')
          .single();
        if (error || !data) {
          const msg = error?.message ?? 'db_error';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: msg });
          return { ok: false, error: msg };
        }
        const output: CreateReminderResult = {
          ok: true,
          summary: `Reminder created${nextFireAt ? ` — next fire ${nextFireAt}` : ''}.`,
          data: { reminder_id: data.id as string, next_fire_at: nextFireAt },
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
