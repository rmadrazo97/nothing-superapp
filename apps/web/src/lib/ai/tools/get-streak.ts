/**
 * get_streak — current + longest calorie-log streak. Mirrors the same
 * computation as /api/mini-apps/calorie-lite/streak but inlined here so
 * the tool doesn't self-HTTP.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const inputSchema = z.object({}).describe('No input — returns caller\'s streak stats.');

type Input = z.infer<typeof inputSchema>;

export interface StreakResult {
  ok: true;
  summary: string;
  data: {
    current_streak_days: number;
    longest_streak_days: number;
    days_logged_this_month: number;
    total_days_logged: number;
  };
}

export interface ToolError { ok: false; error: string }

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function shiftDateKey(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return utcDateKey(dt);
}
function computeCurrent(days: Set<string>, today: string): number {
  if (days.size === 0) return 0;
  let cursor = today;
  if (!days.has(cursor)) {
    const y = shiftDateKey(today, -1);
    if (!days.has(y)) return 0;
    cursor = y;
  }
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return count;
}
function computeLongest(days: Set<string>): number {
  if (days.size === 0) return 0;
  const sorted = Array.from(days).sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (shiftDateKey(sorted[i - 1], 1) === sorted[i]) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

export function makeGetStreakTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Get the user's calorie-logging streak (current + longest + days this month + all-time days). Use when they ask about consistency, habits, streaks.",
    inputSchema,
    async execute(input: Input): Promise<StreakResult | ToolError> {
      try {
        const { data, error } = await supabase
          .from('calorie_daily_totals')
          .select('day')
          .eq('user_id', userId);
        if (error) {
          await insertToolAudit({
            supabase, userId, toolName: 'get_streak',
            input, status: 'error', errorMessage: error.message,
          });
          return { ok: false, error: 'db_error' };
        }
        const today = utcDateKey(new Date());
        const days = new Set<string>();
        for (const row of data ?? []) {
          days.add(String((row as { day: string }).day).slice(0, 10));
        }
        const monthPrefix = today.slice(0, 7);
        let daysThisMonth = 0;
        for (const d of days) if (d.startsWith(monthPrefix)) daysThisMonth += 1;

        const current = computeCurrent(days, today);
        const longest = computeLongest(days);
        const output: StreakResult = {
          ok: true,
          summary: `Current streak: ${current} day${current === 1 ? '' : 's'} (longest ${longest}).`,
          data: {
            current_streak_days: current,
            longest_streak_days: longest,
            days_logged_this_month: daysThisMonth,
            total_days_logged: days.size,
          },
        };
        await insertToolAudit({
          supabase, userId, toolName: 'get_streak',
          input, output, status: 'ok',
        });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'streak_failed';
        await insertToolAudit({
          supabase, userId, toolName: 'get_streak',
          input, status: 'error', errorMessage: message,
        });
        return { ok: false, error: message };
      }
    },
  });
}
