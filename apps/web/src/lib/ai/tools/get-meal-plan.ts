/**
 * get_meal_plan — fetch one meal plan belonging to the current user.
 * Lookup priority: meal_plan_id > active_only (uses preferences pointer) >
 * name substring > most-recently-updated. Read-only, no write gate.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const inputSchema = z
  .object({
    meal_plan_id: z.string().uuid().optional().describe('Exact uuid of the plan to fetch.'),
    active_only: z
      .boolean()
      .default(false)
      .describe("If true and no meal_plan_id, use the user's active plan (preferences.active_meal_plan_id)."),
    name: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('Case-insensitive substring of the plan name — used when no id and not active_only.'),
    summary_only: z
      .boolean()
      .default(false)
      .describe(
        'If true, omit ingredients and return just meal names + option counts + daily targets.',
      ),
  })
  .describe(
    "Fetch one meal plan. Provide meal_plan_id, or active_only=true for the user's current plan, or name substring; falls back to most-recent.",
  );

type Input = z.infer<typeof inputSchema>;

interface PlanRow {
  id: string;
  name: string;
  schema_version: string | null;
  plan: unknown;
  source: unknown;
  athlete: unknown;
  is_template: boolean;
  parsing_notes: string[] | null;
  updated_at: string;
}

interface PlanShape {
  daily_targets?: { calories_kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  meals?: Array<{
    id: string;
    name_en?: string;
    name_es?: string;
    order: number;
    targets?: { calories_kcal: number; protein_g: number; carbs_g: number; fat_g: number };
    options?: unknown[];
  }>;
}

export interface GetMealPlanResult {
  ok: true;
  summary: string;
  data: { meal_plan: PlanRow | Record<string, unknown> };
}
export interface ToolError { ok: false; error: string }

const SELECT =
  'id, name, schema_version, plan, source, athlete, is_template, parsing_notes, updated_at';

export function makeGetMealPlanTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "Fetch one of the user's meal plans. Prefer meal_plan_id; else active_only=true for the current plan; else name substring; else falls back to most recent. Set summary_only=true to skip ingredients.",
    inputSchema,
    async execute(input: Input): Promise<GetMealPlanResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'get_meal_plan', input } as const;
      try {
        let targetId = input.meal_plan_id;
        if (!targetId && input.active_only) {
          const { data: prefs } = await supabase
            .from('preferences')
            .select('active_meal_plan_id')
            .eq('user_id', userId)
            .maybeSingle();
          if (prefs?.active_meal_plan_id) {
            targetId = prefs.active_meal_plan_id as string;
          } else {
            await insertToolAudit({ ...auditBase, status: 'error', errorMessage: 'no_active_plan' });
            return { ok: false, error: 'no_active_plan' };
          }
        }

        let query = supabase
          .from('meal_plans')
          .select(SELECT)
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (targetId) {
          query = query.eq('id', targetId);
        } else if (input.name) {
          query = query.ilike('name', `%${input.name}%`);
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        if (!data) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: 'not_found' });
          return { ok: false, error: 'not_found' };
        }

        const row = data as PlanRow;
        const plan = (row.plan ?? {}) as PlanShape;
        const meals = Array.isArray(plan.meals) ? plan.meals : [];
        const summary = `Plan "${row.name}" — ${meals.length} meal${meals.length === 1 ? '' : 's'}${plan.daily_targets ? `, ${plan.daily_targets.calories_kcal} kcal/day` : ''}.`;

        let payload: PlanRow | Record<string, unknown> = row;
        if (input.summary_only) {
          payload = {
            id: row.id,
            name: row.name,
            updated_at: row.updated_at,
            daily_targets: plan.daily_targets ?? null,
            meal_summaries: meals.map((m) => ({
              id: m.id,
              order: m.order,
              name: m.name_en ?? m.name_es ?? m.id,
              targets: m.targets ?? null,
              option_count: Array.isArray(m.options) ? m.options.length : 0,
            })),
          };
        }

        const output: GetMealPlanResult = {
          ok: true,
          summary,
          data: { meal_plan: payload },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'fetch_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
