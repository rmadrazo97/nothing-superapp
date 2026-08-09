/**
 * agent-loops — runs an autonomous copilot loop for a scheduled reminder.
 *
 * Flow:
 *   1. Called from the tick handler with the reminder row.
 *   2. Builds the same tool surface the interactive copilot uses via
 *      `copilotTools(userId, supabase)` — 43 tools out of the box.
 *   3. Invokes `streamText` with `stopWhen: stepCountIs(max_steps)` and
 *      awaits the full text (no streaming — the user isn't watching).
 *   4. Returns { text, error? } for the tick handler to persist into
 *      `reminder_runs` + push.
 *
 * Supabase client: we pass a service-role client (bypasses RLS) with an
 * EXPLICIT user_id scope in every tool call. The copilotTools factory
 * signature is (userId, supabase) — each tool internally adds
 * `.eq('user_id', userId)` (or `.insert({ user_id: userId, ... })`) so RLS
 * is enforced structurally, not by session. Verified against log-water,
 * log-calorie-entry, get-daily-summary, etc.
 *
 * Bounded: max_steps default = 5 (matches interactive copilot). The
 * response is truncated to 2000 chars for the DB, 500 for the push
 * preview.
 *
 * NEVER export from client bundles — imports server-only next/server.
 */
import 'server-only';
import { after } from 'next/server';
import { streamText, stepCountIs } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chatModel } from '@/lib/ai/provider';
import { copilotTools } from '@/lib/ai/tools';
import { sendPushToUser } from '@/lib/push/server';
import { computeNextFireAt, type Reminder } from '@nothing/shared';
import { supabaseService } from '@/lib/supabase/service';

const SYSTEM_PROMPT = [
  'You are an autonomous agent running a scheduled task for the user.',
  'You have access to the same tools the interactive copilot uses — read',
  'their data, run a calculation, log an entry only if the task explicitly',
  'asks you to.',
  '',
  'Rules:',
  '1. Keep the final response SHORT (≤ 300 words). The user will see it as a',
  '   push notification preview + a history entry — brevity wins.',
  '2. Never fabricate values. If a required tool call fails, say so plainly.',
  '3. Prefer 1–2 tool calls. Loops longer than max_steps get cut off.',
  '4. No greetings, no sign-offs — jump straight into the result.',
].join('\n');

export interface AgentLoopResult {
  text: string;
  error?: string;
}

export async function runAgentLoop(
  reminder: Reminder,
  supabase: SupabaseClient,
): Promise<AgentLoopResult> {
  const task = reminder.agent_task;
  if (!task || !task.prompt) {
    return { text: '', error: 'no_agent_task' };
  }
  const maxSteps = Math.max(1, Math.min(10, task.max_steps ?? 5));
  try {
    const result = streamText({
      model: chatModel('text'),
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: task.prompt }],
      tools: copilotTools(reminder.user_id, supabase),
      stopWhen: stepCountIs(maxSteps),
    });
    const text = await result.text;
    return { text: text.slice(0, 2000) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'agent_loop_failed';
    return { text: '', error: message };
  }
}

/**
 * Fire a single reminder now — used by both the cron tick and the
 * "▶ Run now" button. Handles: notify vs agent_loop, persist into
 * reminder_runs, push fan-out, next_fire_at recompute.
 *
 * Returns a compact summary so the caller can aggregate across many
 * reminders in a single tick.
 */
export interface FireOutcome {
  reminder_id: string;
  kind: Reminder['kind'];
  status: 'ok' | 'error' | 'skipped';
  push_sent: boolean;
  agent_summary?: string;
  error?: string;
}

export async function fireReminder(
  reminder: Reminder,
  opts: { agentBackground?: boolean } = {},
): Promise<FireOutcome> {
  const svc = supabaseService();
  const now = new Date();

  // Idempotency: don't re-fire if last_fired_at is within the last minute.
  // Cheap belt-and-suspenders — the tick already filters on next_fire_at.
  if (reminder.last_fired_at) {
    const last = new Date(reminder.last_fired_at).getTime();
    if (now.getTime() - last < 60_000) {
      return {
        reminder_id: reminder.id,
        kind: reminder.kind,
        status: 'skipped',
        push_sent: false,
        error: 'debounced',
      };
    }
  }

  // Compute the next fire from `now` so a firing reminder rolls forward.
  const nextFireAt = computeNextFireAt(
    {
      schedule_kind: reminder.schedule_kind,
      schedule_at: reminder.schedule_at ?? null,
      schedule_time: reminder.schedule_time ?? null,
      schedule_dow: reminder.schedule_dow ?? null,
      schedule_dom: reminder.schedule_dom ?? null,
      schedule_cron: reminder.schedule_cron ?? null,
      timezone: reminder.timezone ?? 'UTC',
    },
    // Advance from 1 second past `now` so we don't re-schedule the same
    // minute for daily/weekly reminders.
    new Date(now.getTime() + 1000),
  );

  // If the schedule is `once` (or otherwise terminal), deactivate.
  const shouldDeactivate = !nextFireAt || reminder.schedule_kind === 'once';

  // We always mark the reminder fired FIRST so a crash during the
  // agent-loop doesn't re-fire it on the next tick.
  await svc
    .from('reminders')
    .update({
      last_fired_at: now.toISOString(),
      next_fire_at: nextFireAt,
      active: shouldDeactivate ? false : reminder.active,
    })
    .eq('id', reminder.id);

  if (reminder.kind === 'notify') {
    const pushRes = await sendPushToUser(
      reminder.user_id,
      {
        title: reminder.title,
        body: reminder.notes ?? ' ',
        url: '/app/reminders',
        tag: `reminder-${reminder.id}`,
      },
      'reminders',
    );
    const pushSent = pushRes.sent > 0;
    await svc.from('reminder_runs').insert({
      reminder_id: reminder.id,
      user_id: reminder.user_id,
      kind: 'notify',
      status: 'ok',
      push_sent: pushSent,
    });
    return {
      reminder_id: reminder.id,
      kind: 'notify',
      status: 'ok',
      push_sent: pushSent,
    };
  }

  // agent_loop — optionally defer to `after()` so the tick handler can
  // return within Vercel's serverless timeout even if Kimi is slow.
  const doAgent = async () => {
    const loop = await runAgentLoop(reminder, svc);
    const status: 'ok' | 'error' = loop.error ? 'error' : 'ok';
    const summary = loop.text.slice(0, 500);
    let pushSent = false;
    if (!loop.error && loop.text.length > 0) {
      const pushRes = await sendPushToUser(
        reminder.user_id,
        {
          title: reminder.title,
          body: summary,
          url: '/app/reminders?tab=history',
          tag: `reminder-${reminder.id}`,
        },
        'reminders',
      );
      pushSent = pushRes.sent > 0;
    }
    await svc.from('reminder_runs').insert({
      reminder_id: reminder.id,
      user_id: reminder.user_id,
      kind: 'agent_loop',
      status,
      agent_summary: loop.text.slice(0, 500),
      push_sent: pushSent,
      error_message: loop.error ?? null,
    });
  };

  if (opts.agentBackground) {
    after(doAgent());
    return {
      reminder_id: reminder.id,
      kind: 'agent_loop',
      status: 'ok',
      push_sent: false,
      agent_summary: '(agent loop running in background)',
    };
  }

  await doAgent();
  return {
    reminder_id: reminder.id,
    kind: 'agent_loop',
    status: 'ok',
    push_sent: false,
  };
}
