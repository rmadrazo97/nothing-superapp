/**
 * create_journal_entry — copilot alias for the journal_entries insert.
 *
 * Journal mini-app shipped in v0.5.13 (migration 033) without copilot tools.
 * This gives the assistant a semantic surface so a user can say "save this as
 * today's journal" and the model writes the row instead of punting them to
 * the Journal mini-app.
 *
 * Server derives today's local date if the client omits `entered_on` — same
 * logic as POST /api/mini-apps/journal/entries, mirrored here so we don't
 * open a timezone-drift gap between the two write paths.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { journalEntryInsertSchema } from '@nothing/shared';
import type { JournalMood } from '@nothing/shared';
import { checkIdempotency, computeIdempotencyKey, insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

type Input = z.infer<typeof journalEntryInsertSchema>;

export interface CreateJournalEntryResult {
  ok: true;
  summary: string;
  data: {
    entry_id: string;
    entered_on: string;
    mood: JournalMood | null;
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

export function makeCreateJournalEntryTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Write a journal entry for today (or a specific date). Optionally tag mood as great/good/neutral/low/bad. Use for capturing user reflections from a chat, e.g. 'save this as today's journal'.",
    inputSchema: journalEntryInsertSchema,
    async execute(input: Input): Promise<CreateJournalEntryResult | ToolError> {
      const idempotencyKey = computeIdempotencyKey('create_journal_entry', input, userId);
      const auditBase = {
        supabase,
        userId,
        toolName: 'create_journal_entry',
        input,
        idempotencyKey,
      } as const;

      // Idempotency short-circuit — if the agent re-emits the same
      // create_journal_entry inside a 30s bucket, return the prior result so
      // we don't insert a duplicate journal row.
      const prior = await checkIdempotency(supabase, userId, idempotencyKey);
      if (prior.hit && prior.output && typeof prior.output === 'object' && 'ok' in prior.output) {
        return prior.output as CreateJournalEntryResult;
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

      const enteredOn = input.entered_on ?? todayLocalISODate();
      const mood = input.mood ?? null;

      try {
        const { data, error } = await supabase
          .from('journal_entries')
          .insert({
            user_id: userId,
            entered_on: enteredOn,
            body: input.body,
            mood,
          })
          .select('id, entered_on, mood')
          .single();
        if (error || !data) {
          const msg = error?.message ?? 'db_error';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: msg });
          return { ok: false, error: msg };
        }
        const row = data as { id: string; entered_on: string; mood: JournalMood | null };
        const output: CreateJournalEntryResult = {
          ok: true,
          summary: `Journal entry saved for ${row.entered_on}.`,
          data: {
            entry_id: row.id,
            entered_on: row.entered_on,
            mood: row.mood,
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
