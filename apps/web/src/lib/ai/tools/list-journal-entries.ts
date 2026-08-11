/**
 * list_journal_entries — read-only enumeration of the caller's recent journal
 * entries, newest first.
 *
 * The model uses this before create_journal_entry (avoid double-writing if the
 * user already journaled today) or to reflect on themes across recent days.
 *
 * No write gate (read tool per _gate.ts convention). Limit is clamped to 50
 * so a runaway call can't dump the whole table into the model context.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JournalEntry } from '@nothing/shared';
import { insertToolAudit } from './_audit';

const inputSchema = z
  .object({
    limit: z.number().int().positive().max(50).optional(),
  })
  .strict();

type Input = z.infer<typeof inputSchema>;

export interface ListJournalEntriesResult {
  ok: true;
  summary: string;
  data: { entries: JournalEntry[] };
}
export interface ToolError {
  ok: false;
  error: string;
}

const SELECT = 'id, user_id, entered_on, mood, body, created_at, updated_at';

export function makeListJournalEntriesTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "List the user's recent journal entries. Use before create_journal_entry to check if they already wrote today, or to reflect on themes across recent entries.",
    inputSchema,
    async execute(input: Input): Promise<ListJournalEntriesResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'list_journal_entries', input } as const;
      const limit = input.limit ?? 10;
      try {
        const { data, error } = await supabase
          .from('journal_entries')
          .select(SELECT)
          .eq('user_id', userId)
          .order('entered_on', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        const entries = (data ?? []) as JournalEntry[];
        const output: ListJournalEntriesResult = {
          ok: true,
          summary: `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`,
          data: { entries },
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
