/**
 * GET  /api/mini-apps/pomodoro/sessions
 * POST /api/mini-apps/pomodoro/sessions
 *
 * Backend for the pomodoro mini-app.
 *
 *   GET  — returns the caller's `pomodoro_sessions` rows for the last 7 days
 *          ordered by `started_at DESC`. Used by the History view + by the
 *          Timer view's "N today" tally.
 *   POST — inserts a completed or aborted session row. Validates via Zod.
 *          `id` is server-generated (`gen_random_uuid()` default in the DB).
 *          `user_id` is server-set from the session cookie and NEVER trusted
 *          from the client. `started_at` / `ended_at` are accepted from the
 *          client so an offline-run session can back-fill the correct times,
 *          but only if they fall inside a 24h window ending "now" (clock-
 *          skew tolerant, forgery-safe).
 *
 * Both handlers are auth-gated (401) AND entitlement-gated (402). The Proxy
 * already redirects unentitled users away from `/app/pomodoro`; this 402
 * layer is defence-in-depth so a direct API call from a subscription-
 * expired session cannot silently succeed.
 *
 * RLS on `pomodoro_sessions` enforces owner-only access at the DB layer;
 * the explicit `.eq('user_id', user.id)` filter is belt-and-suspenders.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { pomodoroPhaseEnum } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TS_MAX_PAST_MS = 24 * 60 * 60 * 1000; // 24h back
const TS_MAX_FUTURE_MS = 5 * 60 * 1000; // 5m forward

const sessionInsertBodySchema = z
  .object({
    phase: pomodoroPhaseEnum,
    // A pomodoro can be as short as 1 minute or as long as 4 hours; 24h
    // upper bound is defensive — any real session is well under it.
    planned_duration_seconds: z.number().int().positive().max(24 * 60 * 60),
    actual_duration_seconds: z.number().int().nonnegative().max(24 * 60 * 60),
    completed: z.boolean().optional(),
    started_at: z.string().datetime({ offset: true }).optional(),
    ended_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const SELECT_COLUMNS =
  'id, user_id, phase, planned_duration_seconds, actual_duration_seconds, completed, started_at, ended_at';

/** Server clock wins if the client-provided timestamp is out of window. */
function clampTimestamp(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return undefined;
  const now = Date.now();
  if (ms > now + TS_MAX_FUTURE_MS) return undefined;
  if (ms < now - TS_MAX_PAST_MS) return undefined;
  return new Date(ms).toISOString();
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { entitlement } = await getEntitlement(user.id, supabase);
  if (!isEntitled(entitlement)) {
    return NextResponse.json(
      { error: 'payment_required', entitlement },
      { status: 402 },
    );
  }

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('pomodoro_sessions')
    .select(SELECT_COLUMNS)
    .eq('user_id', user.id)
    .gte('started_at', sevenDaysAgoIso)
    .order('started_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { entitlement } = await getEntitlement(user.id, supabase);
  if (!isEntitled(entitlement)) {
    return NextResponse.json(
      { error: 'payment_required', entitlement },
      { status: 402 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = sessionInsertBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const startedAt = clampTimestamp(parsed.data.started_at);
  const endedAt = clampTimestamp(parsed.data.ended_at);

  const insert = {
    user_id: user.id,
    phase: parsed.data.phase,
    planned_duration_seconds: parsed.data.planned_duration_seconds,
    actual_duration_seconds: parsed.data.actual_duration_seconds,
    completed: parsed.data.completed ?? true,
    ...(startedAt ? { started_at: startedAt } : {}),
    ...(endedAt ? { ended_at: endedAt } : {}),
  };

  const { data, error } = await supabase
    .from('pomodoro_sessions')
    .insert(insert)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ session: data }, { status: 201 });
}
