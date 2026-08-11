/**
 * create_habit — copilot alias for the habits_habits_create resource tool.
 *
 * Habits mini-app shipped in v0.5.12 without any copilot tools. This gives the
 * assistant a semantic surface so a user can say "add a habit to floss daily"
 * and the model creates the row rather than punting them to the Habits UI.
 *
 * Streak starts at 0 by construction — it's derived on the client from
 * consecutive prior habit_completions rows, so nothing to insert here.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { habitInsertSchema } from '@nothing/shared';
import { checkIdempotency, computeIdempotencyKey, insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

type Input = z.infer<typeof habitInsertSchema>;

export interface CreateHabitResult {
  ok: true;
  summary: string;
  data: { habit_id: string };
}
export interface ToolError {
  ok: false;
  error: string;
}

export function makeCreateHabitTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      'Create a new habit for the user to track daily. Provide a short name (max 80 chars) + optional single emoji + optional target_days_per_week (defaults to 7). Streak starts at 0; user checks it off in the Habits mini-app each day.',
    inputSchema: habitInsertSchema,
    async execute(input: Input): Promise<CreateHabitResult | ToolError> {
      const idempotencyKey = computeIdempotencyKey('create_habit', input, userId);
      const auditBase = {
        supabase,
        userId,
        toolName: 'create_habit',
        input,
        idempotencyKey,
      } as const;

      // Idempotency short-circuit — if the agent re-emits the same
      // create_habit inside a 30s bucket, return the prior result so we
      // don't insert a duplicate habit row.
      const prior = await checkIdempotency(supabase, userId, idempotencyKey);
      if (prior.hit && prior.output && typeof prior.output === 'object' && 'ok' in prior.output) {
        return prior.output as CreateHabitResult;
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
          .from('habits')
          .insert({
            user_id: userId,
            name: input.name,
            emoji: input.emoji ?? null,
            target_days_per_week: input.target_days_per_week ?? 7,
            active: input.active ?? true,
          })
          .select('id')
          .single();
        if (error || !data) {
          const msg = error?.message ?? 'db_error';
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: msg });
          return { ok: false, error: msg };
        }
        const output: CreateHabitResult = {
          ok: true,
          summary: `Habit "${input.name}" added.`,
          data: { habit_id: data.id as string },
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
