/**
 * extract_macros_from_text — parse free-text descriptions into
 * `{ kcal, protein, carbs, fat, confidence }` estimates ready for
 * `log_calorie_entry`.
 *
 * Two strategies:
 *   (a) HEURISTIC — pull any explicit kcal / macro numbers out of the string
 *       with regex, use them if present; if not, look for a foods.name match
 *       and scale to any "Xg" or "X grams" quantity in the text.
 *   (b) LLM FALLBACK — for genuinely free-form input (many words, no numbers)
 *       we ask the same Kimi provider to fill in the shape via generateObject
 *       against a strict Zod schema. Cost is a fraction of a chat turn.
 *
 * READ-only (no writes) — the agent decides whether to follow up with
 * `log_calorie_entry`. Audit-logged so the estimate → log chain is traceable.
 */
import { tool, generateObject } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertToolAudit } from './_audit';
import { chatModel } from '@/lib/ai/provider';

const inputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .describe(
      "Free-text meal description. Example: 'chicken burrito bowl, mostly rice and beans, ~700 kcal' or '150g greek yogurt with honey'.",
    ),
  want: z
    .enum(['entry_ready', 'estimate_only'])
    .default('estimate_only')
    .describe(
      "'entry_ready' → the output must have kcal + name so log_calorie_entry can accept it directly. 'estimate_only' → a best-guess even when values are fuzzy.",
    ),
});

type Input = z.infer<typeof inputSchema>;

interface Estimate {
  name: string;
  kcal_estimate: number;
  protein_g_estimate: number;
  carbs_g_estimate: number;
  fat_g_estimate: number;
  confidence: number;
  method: 'heuristic' | 'llm' | 'foods_match';
  matched_food?: string | null;
}

export interface ExtractMacrosResult {
  ok: true;
  summary: string;
  data: Estimate;
}

export interface ToolError {
  ok: false;
  error: string;
}

interface FoodRow {
  name: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Extract the first "N kcal" / "N calories" number in the text (approximate
 * markers like ~, ≈, "about" are tolerated). Returns null if none present.
 */
function extractKcal(text: string): number | null {
  const m = text.match(/(?:~|≈|about\s+)?(\d{2,5})\s*(?:kcal|cal|calories)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n < 20_000 ? n : null;
}

/** Extract macro grams via "Xg protein / Xg carbs / Xg fat" patterns. */
function extractMacro(text: string, macro: 'protein' | 'carbs?|carbohydrates?' | 'fat'): number | null {
  const re = new RegExp(`(\\d{1,3}(?:\\.\\d+)?)\\s*g(?:rams?)?\\s+(?:of\\s+)?${macro}`, 'i');
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 2000 ? n : null;
}

/** Extract a leading "150g" / "300 grams" quantity. */
function extractQtyG(text: string): number | null {
  const m = text.match(/(\d{2,4}(?:\.\d+)?)\s*g(?:rams?)?\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n <= 5000 ? n : null;
}

/**
 * Try to find a foods row whose name shares meaningful tokens with the text.
 * Returns the first match on the longest 4+ char token.
 */
async function fuzzyMatch(
  supabase: SupabaseClient,
  text: string,
): Promise<FoodRow | null> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return null;
  tokens.sort((a, b) => b.length - a.length);
  for (const t of tokens.slice(0, 3)) {
    const safe = t.replace(/[\\%_]/g, (m) => `\\${m}`);
    const { data } = await supabase
      .from('foods')
      .select('name, serving_g, kcal, protein_g, carbs_g, fat_g')
      .ilike('name', `%${safe}%`)
      .limit(1);
    const row = (data ?? [])[0] as FoodRow | undefined;
    if (row) return row;
  }
  return null;
}

/**
 * Prefer strategy (a) — deterministic + free. Falls to (b) when the input
 * carries no numeric anchors and is verbose enough that a foods match by
 * itself would be too coarse.
 */
function shouldUseLlm(text: string, hasNumbers: boolean, hasMatch: boolean): boolean {
  const wordCount = text.split(/\s+/).length;
  if (hasNumbers) return false;
  if (hasMatch) return false;
  return wordCount > 20;
}

const llmSchema = z.object({
  name: z.string().min(1).max(200),
  kcal_estimate: z.number().nonnegative().max(10_000),
  protein_g_estimate: z.number().nonnegative().max(500),
  carbs_g_estimate: z.number().nonnegative().max(500),
  fat_g_estimate: z.number().nonnegative().max(500),
  confidence: z.number().min(0).max(1),
});

export function makeExtractMacrosFromTextTool(
  userId: string,
  supabase: SupabaseClient,
) {
  return tool({
    description:
      "Parse a free-text meal description into { name, kcal, protein, carbs, fat, confidence }. Use before log_calorie_entry when the user describes food in plain language ('had a burrito bowl, probably 700 cal'). Prefer explicit numbers the user gave; only estimate when they don't.",
    inputSchema,
    async execute(input: Input): Promise<ExtractMacrosResult | ToolError> {
      const auditBase = { supabase, userId, toolName: 'extract_macros_from_text', input } as const;
      try {
        const text = input.text;
        // 1. Try to pull explicit numbers.
        const kcalFromText = extractKcal(text);
        const proteinFromText = extractMacro(text, 'protein');
        const carbsFromText = extractMacro(text, 'carbs?|carbohydrates?');
        const fatFromText = extractMacro(text, 'fat');
        const qtyG = extractQtyG(text);
        const hasNumbers =
          kcalFromText != null ||
          proteinFromText != null ||
          carbsFromText != null ||
          fatFromText != null;

        // 2. Try to match a foods catalog row (used to fill in macros when
        //    only kcal is present, or scale to a stated qty).
        const match = await fuzzyMatch(supabase, text);

        let estimate: Estimate | null = null;

        if (kcalFromText != null && (proteinFromText != null || carbsFromText != null || fatFromText != null)) {
          // User gave kcal + at least one macro — trust them, fill the rest.
          estimate = {
            name: text.slice(0, 120),
            kcal_estimate: kcalFromText,
            protein_g_estimate: proteinFromText ?? Math.round((kcalFromText * 0.3) / 4),
            carbs_g_estimate: carbsFromText ?? Math.round((kcalFromText * 0.45) / 4),
            fat_g_estimate: fatFromText ?? Math.round((kcalFromText * 0.25) / 9),
            confidence: 0.85,
            method: 'heuristic',
            matched_food: match?.name ?? null,
          };
        } else if (match && qtyG != null && Number(match.serving_g) > 0) {
          const factor = qtyG / Number(match.serving_g);
          estimate = {
            name: text.slice(0, 120),
            kcal_estimate: Math.round(Number(match.kcal) * factor),
            protein_g_estimate: Math.round(Number(match.protein_g) * factor),
            carbs_g_estimate: Math.round(Number(match.carbs_g) * factor),
            fat_g_estimate: Math.round(Number(match.fat_g) * factor),
            confidence: 0.75,
            method: 'foods_match',
            matched_food: match.name,
          };
        } else if (kcalFromText != null) {
          // Kcal only — split into a default macro ratio.
          estimate = {
            name: text.slice(0, 120),
            kcal_estimate: kcalFromText,
            protein_g_estimate: Math.round((kcalFromText * 0.3) / 4),
            carbs_g_estimate: Math.round((kcalFromText * 0.45) / 4),
            fat_g_estimate: Math.round((kcalFromText * 0.25) / 9),
            confidence: 0.6,
            method: 'heuristic',
            matched_food: match?.name ?? null,
          };
        } else if (match) {
          // Just a name — use one serving as the estimate.
          estimate = {
            name: text.slice(0, 120),
            kcal_estimate: Math.round(Number(match.kcal)),
            protein_g_estimate: Math.round(Number(match.protein_g)),
            carbs_g_estimate: Math.round(Number(match.carbs_g)),
            fat_g_estimate: Math.round(Number(match.fat_g)),
            confidence: 0.55,
            method: 'foods_match',
            matched_food: match.name,
          };
        }

        // 3. LLM fallback for verbose free-form input with no anchors.
        if (!estimate && shouldUseLlm(text, hasNumbers, Boolean(match))) {
          try {
            const { object } = await generateObject({
              model: chatModel('text'),
              schema: llmSchema,
              system:
                "You estimate nutrition macros for a free-text meal description. Be conservative — err toward common restaurant portions. Confidence is 0..1; 0.5 = rough guess, 0.8 = you're pretty sure.",
              prompt: `Meal description:\n"""${text}"""`,
            });
            estimate = {
              name: object.name.slice(0, 120),
              kcal_estimate: Math.round(object.kcal_estimate),
              protein_g_estimate: Math.round(object.protein_g_estimate),
              carbs_g_estimate: Math.round(object.carbs_g_estimate),
              fat_g_estimate: Math.round(object.fat_g_estimate),
              confidence: Math.max(0, Math.min(1, object.confidence)),
              method: 'llm',
              matched_food: null,
            };
          } catch (llmErr) {
            // Don't fail the whole tool if the LLM fallback errored — return
            // the least-guess we can with a low confidence.
            const message = llmErr instanceof Error ? llmErr.message : 'llm_fallback_failed';
            console.error('[extract_macros_from_text] llm fallback failed', message);
          }
        }

        // 4. Final fallback — very low-confidence heuristic so `entry_ready`
        //    callers still get something to work with. `estimate_only` accepts
        //    a null-ish estimate; we return a low-confidence value either way.
        if (!estimate) {
          estimate = {
            name: text.slice(0, 120),
            kcal_estimate: 500,
            protein_g_estimate: 20,
            carbs_g_estimate: 55,
            fat_g_estimate: 20,
            confidence: 0.2,
            method: 'heuristic',
            matched_food: null,
          };
        }

        // 5. If caller wanted entry_ready + confidence is low, warn via
        //    summary but still return the estimate (the LLM can then ask the
        //    user before logging).
        if (input.want === 'entry_ready' && estimate.confidence < 0.5) {
          const summary = `Low-confidence estimate (${estimate.confidence.toFixed(
            2,
          )}): ${estimate.kcal_estimate} kcal. Confirm with the user before logging.`;
          const output: ExtractMacrosResult = { ok: true, summary, data: estimate };
          await insertToolAudit({ ...auditBase, output, status: 'ok' });
          return output;
        }

        const summary = `~${estimate.kcal_estimate} kcal · ${estimate.protein_g_estimate}p/${estimate.carbs_g_estimate}c/${estimate.fat_g_estimate}f (${estimate.method}, confidence ${estimate.confidence.toFixed(2)}).`;
        const output: ExtractMacrosResult = { ok: true, summary, data: estimate };
        await insertToolAudit({ ...auditBase, output, status: 'ok' });
        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'extract_failed';
        await insertToolAudit({ ...auditBase, status: 'error', errorMessage: message });
        return { ok: false, error: message };
      }
    },
  });
}
