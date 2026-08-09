/**
 * list_reminders — semantic alias for reminders_reminders_list.
 * Read-only, so no write-budget gate.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const inputSchema = z.object({
  active_only: z.boolean().default(true).optional(),
  kind: z.enum(['notify', 'agent_loop']).optional(),
});

type Input = z.infer<typeof inputSchema>;

export interface ListRemindersResult {
  ok: true;
  summary: string;
  data: {
    count: number;
    reminders: Array<{
      id: string;
      title: string;
      kind: string;
      schedule_kind: string;
      next_fire_at: string | null;
      active: boolean;
    }>;
  };
}
export interface ToolError { ok: false; error: string }

export function makeListRemindersTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "List the user's reminders. Filter by kind (notify | agent_loop) or active_only. Returns id + title + schedule + next_fire_at so you can reason about upcoming fires.",
    inputSchema,
    async execute(input: Input): Promise<ListRemindersResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'list_reminders', input } as const;
      try {
        let q = supabase
          .from('reminders')
          .select('id, title, kind, schedule_kind, next_fire_at, active')
          .eq('user_id', userId)
          .order('next_fire_at', { ascending: true })
          .limit(50);
        if (input.active_only !== false) q = q.eq('active', true);
        if (input.kind) q = q.eq('kind', input.kind);
        const { data, error } = await q;
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        const rows = (data ?? []) as ListRemindersResult['data']['reminders'];
        const output: ListRemindersResult = {
          ok: true,
          summary: `Found ${rows.length} reminder(s).`,
          data: { count: rows.length, reminders: rows },
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
