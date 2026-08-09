/**
 * list_meal_plans — compact roll-up of the user's saved meal plans. Read-only.
 * Returns id + name + meal_count + option_count + updated_at so the LLM can
 * pick which to fetch in full via get_meal_plan.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Max plans to return (default 20, cap 50).'),
});

type Input = z.infer<typeof inputSchema>;

interface PlanSummary {
  id: string;
  name: string;
  schema_version: string | null;
  meal_count: number;
  option_count: number;
  is_template: boolean;
  is_active: boolean;
  updated_at: string;
  created_at: string;
}

export interface ListMealPlansResult {
  ok: true;
  summary: string;
  data: { meal_plans: PlanSummary[] };
}
export interface ToolError { ok: false; error: string }

export function makeListMealPlansTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      "List the user's saved meal plans with lightweight metadata (id, name, meal_count, option_count, is_active, timestamps). Use before get_meal_plan when the user asks 'what plans do I have?'",
    inputSchema,
    async execute(input: Input): Promise<ListMealPlansResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'list_meal_plans', input } as const;
      try {
        const [{ data: rows, error }, { data: prefs }] = await Promise.all([
          supabase
            .from('meal_plans')
            .select('id, name, schema_version, plan, is_template, created_at, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(input.limit),
          supabase
            .from('preferences')
            .select('active_meal_plan_id')
            .eq('user_id', userId)
            .maybeSingle(),
        ]);

        if (error) {
          await insertToolAudit({ ...auditBase, status: 'error', errorMessage: error.message });
          return { ok: false, error: error.message };
        }
        const activeId = prefs?.active_meal_plan_id ?? null;
        const summaries: PlanSummary[] = (rows ?? []).map((r) => {
          const row = r as {
            id: string;
            name: string;
            schema_version: string | null;
            plan: { meals?: Array<{ options?: unknown[] }> } | null;
            is_template: boolean;
            created_at: string;
            updated_at: string;
          };
          const meals = Array.isArray(row.plan?.meals) ? row.plan!.meals! : [];
          const optionCount = meals.reduce(
            (n, m) => n + (Array.isArray(m.options) ? m.options.length : 0),
            0,
          );
          return {
            id: row.id,
            name: row.name,
            schema_version: row.schema_version,
            meal_count: meals.length,
            option_count: optionCount,
            is_template: row.is_template,
            is_active: row.id === activeId,
            updated_at: row.updated_at,
            created_at: row.created_at,
          };
        });
        const output: ListMealPlansResult = {
          ok: true,
          summary: `${summaries.length} plan${summaries.length === 1 ? '' : 's'}${activeId ? ' (1 active)' : ''}.`,
          data: { meal_plans: summaries },
        };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'list_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
