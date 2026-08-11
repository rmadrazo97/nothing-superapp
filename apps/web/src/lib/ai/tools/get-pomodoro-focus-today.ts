/**
 * get_pomodoro_focus_today — quick lookup for today's focus stats:
 *   - minutes_today       — sum of actual_seconds across today's work-phase rows.
 *   - cycles_today        — count of those rows.
 *   - current_streak_days — consecutive prior days (walked back from today,
 *                           or yesterday if today has none) with ≥1 work session.
 *
 * The model uses this for "how focused was I today?" / "am I still on
 * streak?" without pulling the full session log into context.
 *
 * No write gate (read tool). We select a 60-day window for the streak walk
 * — plenty of headroom for any real user's streak, cheap to fetch.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const inputSchema = z.object({}).strict();

type Input = z.infer<typeof inputSchema>;

export interface GetPomodoroFocusTodayResult {
  ok: true;
  summary: string;
  data: {
    minutes_today: number;
    cycles_today: number;
    current_streak_days: number;
  };
}
export interface ToolError {
  ok: false;
  error: string;
}

/** Local YYYY-MM-DD in the server's TZ. Matches the mini-app convention. */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function makeGetPomodoroFocusTodayTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Get today's pomodoro focus stats: total minutes of focused work, cycles completed, and the current daily streak.",
    inputSchema,
    async execute(input: Input): Promise<GetPomodoroFocusTodayResult | ToolError> {
      const auditBase = {
        supabase,
        userId,
        toolName: 'get_pomodoro_focus_today',
        input,
      } as const;
      try {
        // 60-day window is enough for any realistic streak and keeps the
        // payload small. We filter to WORK phase here and let JS handle the
        // day-bucketing (Supabase can't group by local calendar date).
        const since = new Date();
        since.setDate(since.getDate() - 60);
        const { data, error } = await supabase
          .from('pomodoro_sessions')
          .select('phase, actual_duration_seconds, started_at')
          .eq('user_id', userId)
          .eq('phase', 'work')
          .gte('started_at', since.toISOString())
          .order('started_at', { ascending: false });
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }

        const now = new Date();
        const todayKey = localDateKey(now);
        const workDates = new Set<string>();
        let secondsToday = 0;
        let cyclesToday = 0;

        for (const row of data ?? []) {
          const actual = Number(row.actual_duration_seconds ?? 0);
          if (actual <= 0) continue;
          const started = new Date(row.started_at as string);
          const key = localDateKey(started);
          workDates.add(key);
          if (key === todayKey) {
            secondsToday += actual;
            cyclesToday += 1;
          }
        }

        // Streak walkback. Anchor: today if today has a session, else
        // yesterday — a fresh morning shouldn't wipe yesterday's streak.
        const anchor = new Date(now);
        anchor.setHours(0, 0, 0, 0);
        if (!workDates.has(todayKey)) {
          anchor.setDate(anchor.getDate() - 1);
        }
        let streak = 0;
        while (workDates.has(localDateKey(anchor))) {
          streak += 1;
          anchor.setDate(anchor.getDate() - 1);
        }

        const minutesToday = Math.round(secondsToday / 60);
        const output: GetPomodoroFocusTodayResult = {
          ok: true,
          summary: `Focused ${minutesToday} minutes today, ${cyclesToday} cycles.`,
          data: {
            minutes_today: minutesToday,
            cycles_today: cyclesToday,
            current_streak_days: streak,
          },
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
