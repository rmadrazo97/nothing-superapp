/**
 * toggle_habit_completion — check / uncheck a habit for a given local date.
 *
 * Mirrors POST /api/mini-apps/habits/completions: if a completion row exists
 * for (habit_id, completed_on) we DELETE it (uncheck), otherwise we INSERT
 * (check). Two identical calls inside the same 30s idempotency window return
 * the cached first result so an accidental double-fire doesn't double-toggle.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { habitCompletionToggleSchema } from '@nothing/shared';
import { checkIdempotency, computeIdempotencyKey, insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

type Input = z.infer<typeof habitCompletionToggleSchema>;

export interface ToggleHabitCompletionResult {
  ok: true;
  summary: string;
  data: {
    toggled_to: 'on' | 'off';
    habit_id: string;
    completed_on: string;
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

export function makeToggleHabitCompletionTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      'Check or uncheck a habit for today (or a specific date). Idempotent — calling it twice cancels itself out. Use list_habits first to look up the habit_id if you only have the name.',
    inputSchema: habitCompletionToggleSchema,
    async execute(input: Input): Promise<ToggleHabitCompletionResult | ToolError> {
      const idempotencyKey = computeIdempotencyKey('toggle_habit_completion', input, userId);
      const auditBase = {
        supabase,
        userId,
        toolName: 'toggle_habit_completion',
        input,
        idempotencyKey,
      } as const;

      const prior = await checkIdempotency(supabase, userId, idempotencyKey);
      if (prior.hit && prior.output && typeof prior.output === 'object' && 'ok' in prior.output) {
        return prior.output as ToggleHabitCompletionResult;
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

      const habitId = input.habit_id;
      const date = input.completed_on ?? todayLocalISODate();

      try {
        // Verify ownership up-front — RLS would block the write anyway, but a
        // clean not_found is friendlier to the LLM than a 42501.
        const { data: habit, error: habitErr } = await supabase
          .from('habits')
          .select('id, name')
          .eq('id', habitId)
          .eq('user_id', userId)
          .maybeSingle();
        if (habitErr) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: habitErr.message });
          return { ok: false, error: habitErr.message };
        }
        if (!habit) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: 'not_found' });
          return { ok: false, error: 'not_found' };
        }
        const habitName = (habit as { name: string }).name;

        const { data: existing, error: existingErr } = await supabase
          .from('habit_completions')
          .select('id')
          .eq('habit_id', habitId)
          .eq('completed_on', date)
          .maybeSingle();
        if (existingErr) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: existingErr.message });
          return { ok: false, error: existingErr.message };
        }

        let toggledTo: 'on' | 'off';
        if (existing) {
          const { error: delErr } = await supabase
            .from('habit_completions')
            .delete()
            .eq('id', (existing as { id: string }).id)
            .eq('user_id', userId);
          if (delErr) {
            await insertToolAudit({ ...auditBase, status: 'error', errorMessage: delErr.message });
            return { ok: false, error: delErr.message };
          }
          toggledTo = 'off';
        } else {
          const { error: insErr } = await supabase
            .from('habit_completions')
            .insert({ habit_id: habitId, user_id: userId, completed_on: date });
          if (insErr) {
            await insertToolAudit({ ...auditBase, status: 'error', errorMessage: insErr.message });
            return { ok: false, error: insErr.message };
          }
          toggledTo = 'on';
        }

        const output: ToggleHabitCompletionResult = {
          ok: true,
          summary: `Toggled "${habitName}" for ${date} → ${toggledTo}.`,
          data: { toggled_to: toggledTo, habit_id: habitId, completed_on: date },
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
