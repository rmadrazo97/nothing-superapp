/**
 * start_pomodoro — the pomodoro timer runs client-side; `pomodoro_sessions`
 * is only inserted when a phase completes. So the "start" tool returns a
 * structured action-intent — { app: 'pomodoro', action: 'start', mode, duration_minutes } —
 * that the client renders as a "Start focus (25m) →" chip. Tapping the chip
 * deep-links into /app/pomodoro with query params the timer reads.
 *
 * We still audit + gate the call so runaway prompts can't spam action intents
 * either.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';
import { assertEntitled, assertWriteBudget } from './_gate';

const modeEnum = z.enum(['focus', 'short_break', 'long_break']);

const inputSchema = z.object({
  mode: modeEnum.default('focus').describe('focus | short_break | long_break'),
  duration_minutes: z
    .number()
    .int()
    .min(1)
    .max(240)
    .default(25)
    .describe('Duration in minutes (default 25 for focus).'),
});

type Input = z.infer<typeof inputSchema>;

export interface StartPomodoroResult {
  ok: true;
  summary: string;
  data: {
    app: 'pomodoro';
    action: 'start';
    mode: 'focus' | 'short_break' | 'long_break';
    duration_minutes: number;
    deep_link: string;
  };
}
export interface ToolError { ok: false; error: string }

export function makeStartPomodoroTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      'Prepare a pomodoro session for the user. Returns an action-intent the app renders as a "Start focus →" chip that deep-links into /app/pomodoro with the requested mode + duration.',
    inputSchema,
    async execute(input: Input): Promise<StartPomodoroResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'start_pomodoro', input } as const;

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

      const deepLink = `/app/pomodoro?start=1&mode=${input.mode}&minutes=${input.duration_minutes}`;
      const output: StartPomodoroResult = {
        ok: true,
        summary: `Ready to start pomodoro (${input.mode}, ${input.duration_minutes}m).`,
        data: {
          app: 'pomodoro',
          action: 'start',
          mode: input.mode,
          duration_minutes: input.duration_minutes,
          deep_link: deepLink,
        },
      };
      await insertToolAudit({ ...auditBase, output, status: 'ok' });
      return output;
    },
  });
}
