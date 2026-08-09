/**
 * POST /api/copilot — Vercel AI SDK v5 streamed chat with tool-calling.
 *
 * The copilot went from a read-only chat to a tool-calling agent (v0.4).
 * It can now:
 *   - search foods (search_foods) + tell you today's totals (get_daily_summary)
 *   - log a meal / water / weight on your behalf (log_*)
 *   - fire a "start pomodoro" action-intent (start_pomodoro)
 *   - read your gym history + calorie streak (get_gym_history, get_streak)
 *
 * Every request is:
 *   1. AUTH gated  — Supabase session cookie (401 if none)
 *   2. RATE limited — 30 chat calls/user/hour (429)
 *   3. Bounded to <= MAX_MESSAGES so a caller can't blow up context / cost
 *
 * Write tools carry a SECOND rate-limit budget (10 writes/user/hour, see
 * lib/ai/tools/_gate.ts) so a runaway agent loop can't fill the DB.
 *
 * Provider config lives in `lib/ai/provider.ts` — one switch case away from
 * OpenRouter or a fallback provider.
 */
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { chatModel } from '@/lib/ai/provider';
import { copilotTools } from '@/lib/ai/tools';
import { assembleUserContext } from '@/lib/kimi/context';
import { limitPerKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MESSAGES = 20;
// 30 chat calls/user/hour. Reasoning-model calls at ~$0.01–0.05 apiece — this
// hard-caps at ~$1.50/user/hour, well below the $1/mo revenue floor.
const COPILOT_LIMIT_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;
// Agent loop cap. 5 steps is enough for "search_foods → log_calorie_entry →
// summarise" with a small buffer, tight enough that a runaway loop terminates.
const MAX_AGENT_STEPS = 5;

const SYSTEM_PROMPT = [
  "You are Nothing Superapp's copilot. You can search the user's data, log",
  'new entries, and start actions on their behalf via the tools provided.',
  '',
  'Rules:',
  "1. When the user's request implies logging (e.g. \"I ate two eggs\"), CALL",
  "   the appropriate tool — don't just describe what you would log.",
  '2. Cite the mini-app in your response ("Logged to Calorie Lite · 156 kcal").',
  "3. Never fabricate a value. If a food isn't in search_foods results, ask",
  '   the user for kcal/macros before logging a custom entry.',
  '4. Prefer one tool call per turn unless the user explicitly batches.',
  '5. Confirm irreversible actions (delete_*) before calling — v1 has no',
  '   delete tools so this is future-proofing.',
  '6. If a tool returns { ok: false, error }, tell the user plainly what',
  '   failed and suggest a fix.',
  '',
  'Image handling:',
  '- When the user shares a photo of food, identify the items and estimate',
  '  portions. Then either call log_calorie_entry (if the user asked to log',
  '  it) or return an estimate with a confidence caveat: "This looks like',
  '  ~450 kcal of chicken and rice, but portion sizes from photos are ± 20%."',
  '- When the user shares a restaurant menu photo, extract dish names and',
  '  prices. If they asked what fits their macros, call get_daily_summary',
  '  first to see what\'s left in their budget, then recommend the best-fit',
  '  dish(es) explaining the macro reasoning.',
  '- If a photo is ambiguous or blurry, ask a clarifying question before',
  '  logging.',
  '',
  // Insertion point for future workers (meal plans, in-app awareness).
  // NSA_SYSTEM_PROMPT_APPEND — additional context blocks land above this line.
  'Cross-mini-app context (JSON, read-only, snapshot at request time) follows:',
  '--- USER CONTEXT ---',
].join('\n');

/**
 * When the client sends `context: 'calorie-lite'`, we append this scoped
 * system prompt block so the copilot prefers nutrition tools, reads the
 * user's active meal plan before suggesting swaps, and cites the plan
 * ingredient/option in replies.
 *
 * Kept as a const so a future context-aware router can enum-lookup rather
 * than string-switch.
 */
const CALORIE_LITE_PROMPT_APPEND = [
  '',
  '--- CONTEXT: CALORIE LITE ---',
  'You are currently ANSWERING FROM WITHIN Calorie Lite. Prioritize nutrition',
  'tools (search_foods, log_calorie_entry, log_meal_from_plan, get_daily_summary,',
  'find_equivalent_food, suggest_from_menu, extract_macros_from_text) and read the',
  "user's active meal plan (get_meal_plan with active_only=true) before answering",
  'swap/what-to-eat questions. Cite the meal plan option or ingredient explicitly',
  'when suggesting.',
].join('\n');

/**
 * Bounded 2KB scoped-context block — server-side reads only, no tool call.
 * Called in-line for `context === 'calorie-lite'` so the model has today's
 * remaining macros + active plan name at hand before its first tool call.
 *
 * Failure modes are all soft — a missing row / DB blip returns an empty
 * string rather than blowing up the chat. If the block exceeds 2KB it's
 * truncated with a "…" marker to stay under the cap the caller promised.
 */
async function buildCalorieLiteContextBlock(
  userId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const [totalsRes, prefsRes] = await Promise.all([
      supabase
        .from('calorie_daily_totals')
        .select('total_kcal, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g')
        .eq('user_id', userId)
        .eq('day', day)
        .maybeSingle(),
      supabase
        .from('preferences')
        .select('active_meal_plan_id, daily_calorie_goal, protein_target_g, carbs_target_g, fat_target_g')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    const totals = (totalsRes.data ?? {}) as Record<string, number | null>;
    const prefs = (prefsRes.data ?? {}) as Record<string, unknown> | null;

    const activePlanId = (prefs?.active_meal_plan_id as string | null) ?? null;
    let planName: string | null = null;
    let planTargets: {
      calories_kcal?: number;
      protein_g?: number;
      carbs_g?: number;
      fat_g?: number;
    } | null = null;
    if (activePlanId) {
      const { data: planRow } = await supabase
        .from('meal_plans')
        .select('name, plan')
        .eq('user_id', userId)
        .eq('id', activePlanId)
        .maybeSingle();
      if (planRow) {
        planName = (planRow.name as string) ?? null;
        const plan = (planRow.plan ?? {}) as {
          daily_targets?: {
            calories_kcal?: number;
            protein_g?: number;
            carbs_g?: number;
            fat_g?: number;
          };
        };
        planTargets = plan.daily_targets ?? null;
      }
    }

    const kcalGoal =
      (planTargets?.calories_kcal as number | undefined) ??
      (prefs?.daily_calorie_goal as number | undefined) ??
      null;
    const proteinGoal =
      (planTargets?.protein_g as number | undefined) ??
      (prefs?.protein_target_g as number | undefined) ??
      null;
    const carbsGoal =
      (planTargets?.carbs_g as number | undefined) ??
      (prefs?.carbs_target_g as number | undefined) ??
      null;
    const fatGoal =
      (planTargets?.fat_g as number | undefined) ??
      (prefs?.fat_target_g as number | undefined) ??
      null;

    const kcal = Number(totals.total_kcal ?? 0);
    const protein = Number(totals.total_protein_g ?? 0);
    const carbs = Number(totals.total_carbs_g ?? 0);
    const fat = Number(totals.total_fat_g ?? 0);

    const remaining = {
      kcal: kcalGoal != null ? Math.max(0, kcalGoal - kcal) : null,
      protein_g: proteinGoal != null ? Math.max(0, proteinGoal - protein) : null,
      carbs_g: carbsGoal != null ? Math.max(0, carbsGoal - carbs) : null,
      fat_g: fatGoal != null ? Math.max(0, fatGoal - fat) : null,
    };

    const compact = {
      date: day,
      today: {
        kcal: Math.round(kcal),
        protein_g: Math.round(protein),
        carbs_g: Math.round(carbs),
        fat_g: Math.round(fat),
      },
      targets: {
        kcal: kcalGoal,
        protein_g: proteinGoal,
        carbs_g: carbsGoal,
        fat_g: fatGoal,
      },
      remaining,
      active_meal_plan: activePlanId
        ? { id: activePlanId, name: planName, daily_targets: planTargets }
        : null,
    };
    let json = JSON.stringify(compact);
    if (json.length > 2000) json = `${json.slice(0, 1997)}…`;
    return `\n--- CALORIE LITE SNAPSHOT ---\n${json}\n--- END CALORIE LITE SNAPSHOT ---`;
  } catch {
    return '';
  }
}

/**
 * True if any UI message carries a `file` part with an image mediaType.
 * Kimi K2.6 already handles images, but we still route through the vision
 * variant so operators can override with `moonshot-v1-*-vision-preview` via
 * `KIMI_VISION_MODEL` without touching code.
 */
function hasImageParts(messages: UIMessage[]): boolean {
  for (const m of messages) {
    if (!Array.isArray(m.parts)) continue;
    for (const p of m.parts) {
      if (
        (p as { type?: string }).type === 'file' &&
        typeof (p as { mediaType?: string }).mediaType === 'string' &&
        (p as { mediaType: string }).mediaType.startsWith('image')
      ) {
        return true;
      }
    }
  }
  return false;
}

export async function POST(request: Request) {
  // 1. Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Rate limit per user (route-entry gate — the write-tool gate is separate).
  const gate = limitPerKey(`copilot:${user.id}`, COPILOT_LIMIT_PER_HOUR, HOUR_MS);
  if (!gate.ok) {
    return new Response(
      JSON.stringify({
        error: 'rate_limited',
        limit: gate.limit,
        retry_after_seconds: gate.retryAfterSeconds,
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...gate.headers },
      },
    );
  }

  // 3. Parse + validate body. `useChat()` posts { messages: UIMessage[] }.
  //    Optional `context` field lets a mini-app scope the copilot ("I'm
  //    inside calorie-lite") so the system prompt + injected snapshot can
  //    steer tool selection.
  let body: { messages?: UIMessage[]; context?: string };
  try {
    body = (await request.json()) as { messages?: UIMessage[]; context?: string };
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const uiMessages = Array.isArray(body.messages) ? body.messages : [];
  if (uiMessages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (uiMessages.length > MAX_MESSAGES) {
    return new Response(
      JSON.stringify({ error: 'too_many_messages', max: MAX_MESSAGES }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 4. Assemble cross-mini-app context (still useful for one-shot Q&A that
  //    doesn't warrant a tool call). Attached to the system prompt.
  const { context } = await assembleUserContext(user.id, supabase);
  const scope = typeof body.context === 'string' ? body.context.trim().toLowerCase() : '';
  const isCalorieLite = scope === 'calorie-lite';
  const scopedPromptAppend = isCalorieLite ? CALORIE_LITE_PROMPT_APPEND : '';
  const scopedContextBlock = isCalorieLite
    ? await buildCalorieLiteContextBlock(user.id, supabase)
    : '';
  const system = `${SYSTEM_PROMPT}\n${context}\n--- END CONTEXT ---${scopedPromptAppend}${scopedContextBlock}`;

  // 5. Kick off the streamed generation. Tools + step cap keep the agent
  //    bounded; UIMessageStream shape is what `useChat()` on the client
  //    knows how to parse.
  const modelMessages = await convertToModelMessages(uiMessages);
  const variant: 'text' | 'vision' = hasImageParts(uiMessages) ? 'vision' : 'text';
  const result = streamText({
    model: chatModel(variant),
    system,
    messages: modelMessages,
    tools: copilotTools(user.id, supabase),
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
  });

  return result.toUIMessageStreamResponse();
}
