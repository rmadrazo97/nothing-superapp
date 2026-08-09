/**
 * get_daily_summary — one call, everything the LLM needs to answer "how's
 * my day going". Reads from the `calorie_daily_totals` VIEW (kcal + macros
 * in one row) + water_entries + weight_entries + pomodoro_sessions for the
 * given day.
 *
 * Date defaulting: caller may pass `date=YYYY-MM-DD` (UTC anchor to match the
 * view) or omit for "today (UTC)". Not the user's local TZ yet — matches the
 * rest of the app which is UTC-anchored today; per-user tz is future work.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const inputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional()
    .describe(
      "UTC-anchored day (YYYY-MM-DD). Omit for today. Example: '2026-08-09'.",
    ),
});

type Input = z.infer<typeof inputSchema>;

export interface DailySummaryResult {
  ok: true;
  summary: string;
  data: {
    date: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    water_ml: number;
    weight_kg: number | null;
    pomodoro_focus_min: number;
    pomodoro_sessions_completed: number;
  };
}

export interface ToolError { ok: false; error: string }

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function makeGetDailySummaryTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Get today's (or a chosen day's) totals across calorie-lite + water + weight + pomodoro. Use this when the user asks how their day is going, calories remaining, focus time so far, etc.",
    inputSchema,
    async execute(input: Input): Promise<DailySummaryResult | ToolError> {
      const day = input.date ?? todayUtc();
      const dayStartIso = `${day}T00:00:00.000Z`;
      const dayEndMs = Date.parse(dayStartIso) + 24 * 60 * 60 * 1000;
      const dayEndIso = new Date(dayEndMs).toISOString();

      try {
        const [totalsRes, waterRes, weightRes, pomoRes] = await Promise.all([
          supabase
            .from('calorie_daily_totals')
            .select('total_kcal, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g')
            .eq('user_id', userId)
            .eq('day', day)
            .maybeSingle(),
          supabase
            .from('water_entries')
            .select('ml')
            .eq('user_id', userId)
            .gte('entered_at', dayStartIso)
            .lt('entered_at', dayEndIso),
          supabase
            .from('weight_entries')
            .select('weight_kg, entered_at')
            .eq('user_id', userId)
            .gte('entered_at', dayStartIso)
            .lt('entered_at', dayEndIso)
            .order('entered_at', { ascending: false })
            .limit(1),
          supabase
            .from('pomodoro_sessions')
            .select('phase, actual_duration_seconds, completed')
            .eq('user_id', userId)
            .gte('started_at', dayStartIso)
            .lt('started_at', dayEndIso),
        ]);

        const totals = (totalsRes.data ?? {}) as Record<string, number | null>;
        const waterMl = (waterRes.data ?? []).reduce(
          (acc, r) => acc + Number((r as { ml: number }).ml || 0),
          0,
        );
        const weightRow = (weightRes.data ?? [])[0] as
          | { weight_kg: number }
          | undefined;
        const pomos = (pomoRes.data ?? []) as Array<{
          phase: string;
          actual_duration_seconds: number;
          completed: boolean;
        }>;
        const focusSec = pomos
          .filter((p) => p.phase === 'work')
          .reduce((acc, p) => acc + (p.actual_duration_seconds ?? 0), 0);
        const completedWork = pomos.filter((p) => p.phase === 'work' && p.completed).length;

        const kcal = Number(totals.total_kcal ?? 0);
        const summary = `${day}: ${Math.round(kcal)} kcal, ${waterMl}ml water, ${Math.round(focusSec / 60)} focus min${weightRow ? `, ${weightRow.weight_kg}kg` : ''}.`;

        const output: DailySummaryResult = {
          ok: true,
          summary,
          data: {
            date: day,
            kcal: Number(totals.total_kcal ?? 0),
            protein_g: Number(totals.total_protein_g ?? 0),
            carbs_g: Number(totals.total_carbs_g ?? 0),
            fat_g: Number(totals.total_fat_g ?? 0),
            fiber_g: Number(totals.total_fiber_g ?? 0),
            water_ml: waterMl,
            weight_kg: weightRow ? Number(weightRow.weight_kg) : null,
            pomodoro_focus_min: Math.round(focusSec / 60),
            pomodoro_sessions_completed: completedWork,
          },
        };
        await insertToolAudit({
          supabase, userId, toolName: 'get_daily_summary',
          input, output, status: 'ok',
        });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'summary_failed';
        await insertToolAudit({
          supabase, userId, toolName: 'get_daily_summary',
          input, status: 'error', errorMessage: message,
        });
        return { ok: false, error: message };
      }
    },
  });
}
