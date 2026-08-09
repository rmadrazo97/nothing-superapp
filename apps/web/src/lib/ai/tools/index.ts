/**
 * copilotTools(userId, supabase) — the ToolSet passed to `streamText`.
 *
 * Every tool is instantiated per-request with the caller's session-scoped
 * Supabase client so RLS enforces owner-scoping even if a bug lets a stray
 * userId sneak past the `assertEntitled` gate.
 *
 * Naming — keep in sync with the system prompt in `route.ts`. Tool names are
 * snake_case (the LLM's convention) and semantic ("log_calorie_entry" not
 * "insertRow").
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeSearchFoodsTool } from './search-foods';
import { makeGetDailySummaryTool } from './get-daily-summary';
import { makeGetStreakTool } from './get-streak';
import { makeGetGymHistoryTool } from './get-gym-history';
import { makeLogCalorieEntryTool } from './log-calorie-entry';
import { makeLogWaterTool } from './log-water';
import { makeLogWeightTool } from './log-weight';
import { makeStartPomodoroTool } from './start-pomodoro';

export function copilotTools(userId: string, supabase: SupabaseClient) {
  return {
    search_foods: makeSearchFoodsTool(userId, supabase),
    get_daily_summary: makeGetDailySummaryTool(userId, supabase),
    get_streak: makeGetStreakTool(userId, supabase),
    get_gym_history: makeGetGymHistoryTool(userId, supabase),
    log_calorie_entry: makeLogCalorieEntryTool(userId, supabase),
    log_water: makeLogWaterTool(userId, supabase),
    log_weight: makeLogWeightTool(userId, supabase),
    start_pomodoro: makeStartPomodoroTool(userId, supabase),
  };
}

export type CopilotToolSet = ReturnType<typeof copilotTools>;
