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
import { deriveThreadTitle } from '@nothing/shared';

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
  '7. Do not use markdown tables — the client renderer does not support them',
  '   and they display as raw pipe text to the user. Use short paragraphs or',
  '   bullet lists instead — or, better, call one of the render_* tools',
  '   listed below to have the client render the data as a pixel-panel',
  '   component.',
  '',
  'Generative UI (render_* tools) — CALL, DO NOT DESCRIBE:',
  '**REQUIRED**: use render_* tools for ALL quantitative responses. Prose-only',
  'responses for numeric queries (kcal, macros, weight, streak length, workout',
  'volume, adherence %, etc.) are a bug — the client renders render_* payloads',
  'as pixel-panel components in the Nothing OS aesthetic and the sentence you',
  'were about to write is inferior to the panel every single time.',
  '',
  'Decision matrix — pick the render_* tool BEFORE composing prose:',
  '- "How many/much X do I have left today?" → render_progress_dots',
  '  (goal + current + remaining, e.g. kcal left, protein left, workouts left this week)',
  '- "Show me my <metric> over time" → render_line_chart',
  '  (weekly / daily buckets — weight trend, adherence over weeks, kcal over days)',
  '- "Compare X across categories" → render_bar_chart',
  '  (single or grouped — volume per muscle group, kcal per meal, sets per exercise)',
  '- "What are my options for X?" → render_data_table',
  '  (rows × columns of attributes — meal plan options, exercise variants, food picks)',
  '- "How am I doing today?" → render_metric_grid',
  '  (2×2 or 3×2 KPI tiles with deltas — daily macros, weekly summary)',
  '- "What\'s the current state of my Pomodoro/streak/gauge?" → render_arc_graph',
  '  (cyclic values — pomodoro cycle progress, sunrise position, not simple X-of-Y)',
  '- "Just tell me one number with context" → render_stat_ticker',
  '  (one big metric with optional delta + sparkline — current weight, streak length)',
  '',
  'Anti-example (do NOT do this):',
  '❌ Bad response: "You have 320 kcal left today out of 2200."',
  '✅ Good response: call `render_progress_dots({label: "KCAL LEFT · TODAY",',
  '   current: 320, total: 2200})`. The pixel-panel replaces the sentence entirely.',
  '',
  '- After a render_* call, keep any accompanying prose SHORT (one sentence',
  '  of context is plenty). The rendered card carries the message.',
  '- For prose answers (explanations, coaching, suggestions), keep using',
  '  markdown as before — render_* is for QUANTITATIVE payloads only.',
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
  //    Optional `thread_id` opts the turn into persistent history — the
  //    route loads prior messages + upserts new turns via onFinish.
  let body: {
    messages?: UIMessage[];
    context?: string;
    thread_id?: string;
    timezone?: string;
  };
  try {
    body = (await request.json()) as {
      messages?: UIMessage[];
      context?: string;
      thread_id?: string;
      timezone?: string;
    };
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

  // Timezone injection (task #105) — the client sends the browser IANA zone
  // on every request. Fall back to the persisted profiles.timezone, then UTC.
  // The block below is what makes "remind me in 10 min" hit the user's LOCAL
  // wall-clock instead of drifting on a UTC-relative interpretation.
  const clientTz = typeof body.timezone === 'string' ? body.timezone.trim() : '';
  let userTz = /^[A-Za-z0-9._+/-]{1,64}$/.test(clientTz) ? clientTz : '';
  if (!userTz) {
    try {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', user.id)
        .maybeSingle();
      const persisted = (profileRow?.timezone as string | null) ?? null;
      if (persisted && /^[A-Za-z0-9._+/-]{1,64}$/.test(persisted)) userTz = persisted;
    } catch {
      // ignore — fall through to UTC
    }
  }
  if (!userTz) userTz = 'UTC';
  const nowLocalIso = safeFormatLocalIso(userTz);
  const timezoneBlock = [
    '',
    '--- USER TIMEZONE ---',
    `IANA zone: ${userTz}`,
    `Current local time: ${nowLocalIso}`,
    'When creating reminders (create_reminder), ALWAYS set `timezone` to the IANA zone above.',
    'When the user says "in 10 minutes", "tomorrow at 8", "tonight", interpret those as the user\'s LOCAL wall-clock, not UTC. Convert to the correct ISO/HH:MM values before calling the tool.',
    '--- END TIMEZONE ---',
  ].join('\n');

  const system = `${SYSTEM_PROMPT}\n${context}\n--- END CONTEXT ---${timezoneBlock}${scopedPromptAppend}${scopedContextBlock}`;

  // Persist the browser-reported timezone opportunistically — if the client
  // just told us a valid zone that differs from what we have on file, refresh
  // it so the profile record is always current. Non-fatal on failure.
  if (userTz && userTz !== 'UTC' && clientTz === userTz) {
    void supabase
      .from('profiles')
      .update({ timezone: userTz })
      .eq('id', user.id)
      .then(({ error }) => {
        if (error) console.error('[copilot] profile timezone update failed', error.message);
      });
  }

  // 4b. Resolve thread persistence — if `thread_id` is present and belongs
  //     to the caller, we'll persist the fresh turn on stream finish. If not
  //     present, no persistence happens (backwards-compatible with clients
  //     that don't opt in yet).
  const threadIdRaw = typeof body.thread_id === 'string' ? body.thread_id.trim() : '';
  const threadId = /^[0-9a-fA-F-]{36}$/.test(threadIdRaw) ? threadIdRaw : null;
  let threadValid = false;
  if (threadId) {
    const { data: threadRow } = await supabase
      .from('copilot_threads')
      .select('id, title')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .maybeSingle();
    threadValid = Boolean(threadRow);
  }

  // The last message in `uiMessages` is the fresh user turn — everything
  // before it is history already known to the client (and, if the thread is
  // persistent, already stored). We persist only the last user turn + the
  // new assistant response, not the entire array (avoids double-writes).
  const lastUserMsg =
    uiMessages.length > 0 ? uiMessages[uiMessages.length - 1] : null;
  const isFreshUserTurn = lastUserMsg?.role === 'user';

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
    async onFinish({ response }) {
      // Persist only when the caller opted in AND the thread is theirs.
      if (!threadValid || !threadId) return;
      try {
        await persistTurn({
          supabase,
          userId: user.id,
          threadId,
          userMessage: isFreshUserTurn ? lastUserMsg : null,
          assistantMessages: response.messages,
        });
      } catch (err) {
        // Never bubble a persistence failure into the stream — the user
        // already sees the reply. Log for triage.
        console.error('[copilot] persist_turn_failed', err);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}

/**
 * Persist the fresh turn (last user message + assistant response messages)
 * to `copilot_messages`, then bump the thread's `last_message_at` +
 * auto-title from the first user turn if the title is still the default.
 *
 * All writes go through the same authed supabase client so RLS still gates
 * them — a compromised thread_id would fail the WHERE user_id = auth.uid()
 * check on the trigger's underlying policies.
 */
async function persistTurn({
  supabase,
  userId,
  threadId,
  userMessage,
  assistantMessages,
}: {
  supabase: SupabaseClient;
  userId: string;
  threadId: string;
  userMessage: UIMessage | null;
  assistantMessages: Array<{ role: string; content: unknown }>;
}) {
  const inserts: Array<{
    thread_id: string;
    user_id: string;
    role: 'user' | 'assistant' | 'system';
    parts: unknown;
  }> = [];

  if (userMessage) {
    inserts.push({
      thread_id: threadId,
      user_id: userId,
      role: 'user',
      // Store the raw parts as jsonb — round-trips text + file parts
      // exactly as the client sent them.
      parts: Array.isArray(userMessage.parts) ? userMessage.parts : [],
    });
  }

  // The AI SDK response messages array holds one entry per assistant step.
  // We flatten each entry's content array into UIMessage-shaped `parts` so
  // rehydration through /threads/[id] can render tool calls + text alike.
  for (const msg of assistantMessages) {
    if (msg.role !== 'assistant') continue;
    const parts = normalizeAssistantContent(msg.content);
    if (parts.length === 0) continue;
    inserts.push({
      thread_id: threadId,
      user_id: userId,
      role: 'assistant',
      parts,
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('copilot_messages').insert(inserts);
    if (error) throw new Error(`insert_messages: ${error.message}`);
  }

  // Bump last_message_at + auto-title. We fetch title first so we only
  // rewrite the default; if the user renamed it, we leave it alone.
  const { data: threadRow } = await supabase
    .from('copilot_threads')
    .select('title')
    .eq('id', threadId)
    .eq('user_id', userId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
  };
  const currentTitle = (threadRow?.title as string | null) ?? null;
  if (currentTitle == null || currentTitle === 'New chat') {
    // Derive a fresh title from the first user message text.
    const firstUserText = extractText(userMessage);
    if (firstUserText.length > 0) {
      patch.title = deriveThreadTitle(firstUserText);
    }
  }
  await supabase
    .from('copilot_threads')
    .update(patch)
    .eq('id', threadId)
    .eq('user_id', userId);
}

/**
 * Convert an AI SDK response-message `content` field (which can be a string
 * OR an array of parts with variant `text` / `tool-call` / `tool-result` /
 * `reasoning`) into a UIMessage-shaped `parts` array that the client's
 * useChat() will re-render identically.
 */
function normalizeAssistantContent(content: unknown): unknown[] {
  if (typeof content === 'string') {
    return content.length > 0 ? [{ type: 'text', text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const parts: unknown[] = [];
  for (const c of content) {
    if (!c || typeof c !== 'object') continue;
    const part = c as Record<string, unknown>;
    const t = part.type;
    if (t === 'text' && typeof part.text === 'string') {
      parts.push({ type: 'text', text: part.text });
    } else if (t === 'reasoning' && typeof part.text === 'string') {
      parts.push({ type: 'reasoning', text: part.text });
    } else if (t === 'tool-call') {
      // Represent tool calls as UI 'tool-*' parts so the ToolCallCard
      // renders correctly on rehydration. State = output-available since
      // we're persisting after the run finished.
      parts.push({
        type: `tool-${String(part.toolName ?? 'tool')}`,
        toolCallId: part.toolCallId,
        state: 'output-available',
        input: part.input ?? part.args ?? null,
      });
    } else if (t === 'tool-result') {
      // Attach the result to the matching tool-call part we just pushed.
      // Look backwards for the freshest tool-* entry to enrich.
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i] as Record<string, unknown>;
        if (typeof p.type === 'string' && p.type.startsWith('tool-') && !p.output) {
          p.output = part.output ?? part.result ?? null;
          if (part.isError) {
            p.state = 'output-error';
            p.errorText =
              typeof part.output === 'string' ? part.output : 'tool_failed';
          }
          break;
        }
      }
    }
  }
  return parts;
}

/**
 * Format `now` as an ISO-like string in the user's IANA zone — e.g.
 * "2026-08-10 21:47 (America/Mexico_City, UTC-06:00)". Used purely inside the
 * system prompt so the model has a concrete "current local wall clock" to
 * reason about "in 10 min" / "tonight" phrasing.
 *
 * Never throws — bad zone → falls back to a UTC label. The route's tz
 * validator upstream should keep us from ever hitting the catch.
 */
function safeFormatLocalIso(tz: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const time = `${get('hour')}:${get('minute')}`;
    const off = get('timeZoneName');
    return `${date} ${time} (${tz}, ${off})`;
  } catch {
    return `${new Date().toISOString()} (UTC — tz parse failed)`;
  }
}

function extractText(msg: UIMessage | null): string {
  if (!msg || !Array.isArray(msg.parts)) return '';
  let out = '';
  for (const p of msg.parts) {
    const part = p as { type?: string; text?: string };
    if (part.type === 'text' && typeof part.text === 'string') {
      out += part.text;
    }
  }
  return out;
}
