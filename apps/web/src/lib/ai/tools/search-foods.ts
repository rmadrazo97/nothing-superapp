/**
 * search_foods — case-insensitive search across the public `foods` table
 * plus the caller's own `custom_foods`. Read-only; scoped by RLS to the
 * caller's session.
 *
 * Returns a compact array optimized for the LLM's context window:
 * { id, source, name, brand, serving_g, serving_label, kcal, protein_g,
 *   carbs_g, fat_g }. The LLM uses `id` (or `custom_id`) + `source` to
 * later call `log_calorie_entry`.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';

const inputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("Case-insensitive substring of the food name, e.g. 'greek yogurt'."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(8)
    .describe('Max results (default 8, hard cap 20).'),
});

type SearchFoodsInput = z.infer<typeof inputSchema>;

interface FoodHit {
  id: string;
  source: 'public' | 'custom';
  name: string;
  brand: string | null;
  serving_g: number;
  serving_label: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface SearchFoodsResult {
  ok: true;
  summary: string;
  data: { hits: FoodHit[] };
}

export interface ToolError {
  ok: false;
  error: string;
}

export function makeSearchFoodsTool(userId: string, supabase: SupabaseClient) {
  return tool({
    description:
      'Search foods (public catalog + user\'s custom foods) by name. Returns hits with per-serving nutrition. Call this before log_calorie_entry when the user names a food.',
    inputSchema,
    async execute(input: SearchFoodsInput): Promise<SearchFoodsResult | ToolError> {
      const safe = input.query.replace(/[\\%_]/g, (m) => `\\${m}`);
      try {
        const [publicRes, customRes] = await Promise.all([
          supabase
            .from('foods')
            .select('id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g')
            .ilike('name', `%${safe}%`)
            .order('name')
            .limit(input.limit),
          supabase
            .from('custom_foods')
            .select('id, name, brand, serving_g, serving_label, kcal, protein_g, carbs_g, fat_g')
            .eq('user_id', userId)
            .ilike('name', `%${safe}%`)
            .order('name')
            .limit(input.limit),
        ]);

        if (publicRes.error && customRes.error) {
          const output: ToolError = { ok: false, error: 'db_error' };
          await insertToolAudit({
            supabase, userId, toolName: 'search_foods',
            input, status: 'error', errorMessage: publicRes.error.message,
          });
          return output;
        }

        const custom = (customRes.data ?? []).map((r) => ({
          ...(r as Record<string, unknown>),
          source: 'custom' as const,
        })) as FoodHit[];
        const pub = (publicRes.data ?? []).map((r) => ({
          ...(r as Record<string, unknown>),
          source: 'public' as const,
        })) as FoodHit[];

        // Custom first (matches the app's own /foods route), then public.
        const hits = [...custom, ...pub].slice(0, input.limit);
        const summary = hits.length
          ? `Found ${hits.length} food match${hits.length === 1 ? '' : 'es'} for "${input.query}".`
          : `No matches for "${input.query}".`;

        const output: SearchFoodsResult = { ok: true, summary, data: { hits } };
        await insertToolAudit({
          supabase, userId, toolName: 'search_foods',
          input, output, status: 'ok',
        });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'search_failed';
        await insertToolAudit({
          supabase, userId, toolName: 'search_foods',
          input, status: 'error', errorMessage: message,
        });
        return { ok: false, error: message };
      }
    },
  });
}
