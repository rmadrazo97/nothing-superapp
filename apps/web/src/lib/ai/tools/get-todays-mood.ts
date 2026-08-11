/**
 * get_todays_mood — quick lookup for the mood on the caller's most recent
 * entry for today's local date. Returns `null` (+ has_entry=false) when the
 * user hasn't journaled yet today.
 *
 * The model uses this to personalize responses ("sounds like a rough day —
 * anything you want to talk through?") without pulling the full body of
 * today's entry into context.
 *
 * No write gate (read tool). Multiple entries per day are allowed on the
 * journal_entries table; we return the most-recently-created row's mood to
 * match the UI's "today's entry = last-written row" convention.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JournalMood } from '@nothing/shared';
import { insertToolAudit } from './_audit';

const inputSchema = z.object({}).strict();

type Input = z.infer<typeof inputSchema>;

export interface GetTodaysMoodResult {
  ok: true;
  summary: string;
  data: {
    mood: JournalMood | null;
    has_entry: boolean;
  };
}
export interface ToolError {
  ok: false;
  error: string;
}

/** Local YYYY-MM-DD in the server's TZ. Matches the mini-app API route. */
function todayLocalISODate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function makeGetTodaysMoodTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Check what mood the user tagged in today's journal entry. Use to personalize responses ('sounds like a rough day — anything you want to talk through?').",
    inputSchema,
    async execute(input: Input): Promise<GetTodaysMoodResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'get_todays_mood', input } as const;
      const today = todayLocalISODate();
      try {
        const { data, error } = await supabase
          .from('journal_entries')
          .select('mood')
          .eq('user_id', userId)
          .eq('entered_on', today)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        const row = (data ?? null) as { mood: JournalMood | null } | null;
        const hasEntry = row != null;
        const mood = row?.mood ?? null;
        const output: GetTodaysMoodResult = {
          ok: true,
          summary: `Today: ${mood ?? (hasEntry ? 'entry without mood' : 'no entry yet')}.`,
          data: { mood, has_entry: hasEntry },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'get_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
