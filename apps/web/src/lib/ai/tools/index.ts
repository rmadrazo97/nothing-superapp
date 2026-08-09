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
// v2 gym routines — coach-grade structured multi-day plans (migration 011)
import { makeCreateGymRoutineTool } from './create-gym-routine';
import { makeGetGymRoutineTool } from './get-gym-routine';
import { makeListGymRoutinesTool } from './list-gym-routines';
// meal plans v1 — nutritionist-style structured plans (migration 012)
import { makeCreateMealPlanTool } from './create-meal-plan';
import { makeGetMealPlanTool } from './get-meal-plan';
import { makeListMealPlansTool } from './list-meal-plans';
import { makeLogMealFromPlanTool } from './log-meal-from-plan';
// calorie-lite smart tools (add-only) — swap ingredients, decode menus, extract
// macros from free text. Alphabetical block, registered together.
import { makeExtractMacrosFromTextTool } from './extract-macros-from-text';
import { makeFindEquivalentFoodTool } from './find-equivalent-food';
import { makeSuggestFromMenuTool } from './suggest-from-menu';
// Framework-generated CRUD tools — every mini-app's declared resources get
// list/get/create/update/delete for free. Coexists with hand-written tools:
// hand-written wins on semantic clarity ("log_water"), framework fills the
// long tail ("calorie_lite_custom_foods_update").
import { resourceTools } from '@/lib/ai/resource-tools';

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
    // gym v2 (add-only)
    create_gym_routine: makeCreateGymRoutineTool(userId, supabase),
    get_gym_routine: makeGetGymRoutineTool(userId, supabase),
    list_gym_routines: makeListGymRoutinesTool(userId, supabase),
    // meal plans v1 (add-only) — nutritionist-style plans w/ options + rules
    create_meal_plan: makeCreateMealPlanTool(userId, supabase),
    get_meal_plan: makeGetMealPlanTool(userId, supabase),
    list_meal_plans: makeListMealPlansTool(userId, supabase),
    log_meal_from_plan: makeLogMealFromPlanTool(userId, supabase),
    // calorie-lite smart tools (add-only) — alphabetical block
    extract_macros_from_text: makeExtractMacrosFromTextTool(userId, supabase),
    find_equivalent_food: makeFindEquivalentFoodTool(userId, supabase),
    suggest_from_menu: makeSuggestFromMenuTool(userId, supabase),
    // framework-generated (calorie_lite_*, pomodoro_*, ...)
    ...resourceTools(userId, supabase),
  };
}

export type CopilotToolSet = ReturnType<typeof copilotTools>;
