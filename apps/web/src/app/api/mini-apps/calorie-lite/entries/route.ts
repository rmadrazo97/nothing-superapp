/**
 * GET  /api/mini-apps/calorie-lite/entries
 * POST /api/mini-apps/calorie-lite/entries
 *
 * Backend for the calorie-lite reference mini-app.
 *
 *   GET  — returns the caller's `app_calorie_entries` rows for the last 7 days
 *          ordered by `entered_at DESC`. Accepts `?date=YYYY-MM-DD` to fetch a
 *          single day's rows instead.
 *   POST — inserts a new entry. Validates via Zod. `id` is server-generated
 *          (`gen_random_uuid()` default in the DB). `user_id` is server-set
 *          from the session cookie and NEVER trusted from the client.
 *          `entered_at` defaults to `now()` in the DB; a client-provided
 *          value is accepted only if it is within the last 24 hours (so users
 *          can back-fill a meal from earlier today but can't forge history).
 *
 * Both handlers are auth-gated (401) AND entitlement-gated (402). The Proxy
 * already redirects unentitled users away from `/app/calorie-lite`; this
 * 402 layer is defence-in-depth so a direct API call from a subscription-
 * expired session cannot silently succeed.
 *
 * RLS on `app_calorie_entries` enforces owner-only access at the DB layer;
 * the explicit `.eq('user_id', user.id)` filter is belt-and-suspenders.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { mealEnum } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// A client-provided `entered_at` is only honoured if it is within this window
// (past OR future — a few minutes of clock skew tolerance for future). This
// lets a mini-app back-fill "this morning's breakfast" but prevents forging
// long-past history that would corrupt the history view + entitlement audits.
const ENTERED_AT_MAX_PAST_MS = 24 * 60 * 60 * 1000; // 24h back
const ENTERED_AT_MAX_FUTURE_MS = 5 * 60 * 1000; // 5m forward

const entryInsertBodySchema = z
  .object({
    meal: mealEnum,
    kcal: z.number().int().nonnegative().max(20000),
    raw_input: z.string().trim().max(500).nullable().optional(),
    protein_g: z.number().int().nonnegative().max(2000).optional(),
    carbs_g: z.number().int().nonnegative().max(2000).optional(),
    fat_g: z.number().int().nonnegative().max(2000).optional(),
    // Client-provided timestamp; optional. Server will validate the window.
    entered_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const dateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const SELECT_COLUMNS =
  'id, user_id, entered_at, meal, raw_input, kcal, protein_g, carbs_g, fat_g';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Entitlement gate — 402 keeps the paywall metaphor at the wire (like Stripe
  // does). The Proxy also redirects the UI, so this is defence-in-depth for
  // direct API callers whose subscription just lapsed.
  const { entitlement } = await getEntitlement(user.id, supabase);
  if (!isEntitled(entitlement)) {
    return NextResponse.json(
      { error: 'payment_required', entitlement },
      { status: 402 },
    );
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');

  let query = supabase
    .from('app_calorie_entries')
    .select(SELECT_COLUMNS)
    .eq('user_id', user.id)
    .order('entered_at', { ascending: false })
    .limit(500);

  if (dateParam) {
    const parsed = dateParamSchema.safeParse(dateParam);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
    }
    // Server treats the date as a UTC-day window. Client-side, the caller
    // formats a local-day key from `entered_at` for grouping — the mini-app
    // does NOT rely on this param for the "today" view (it fetches 7 days
    // and filters client-side), so this branch is for future callers that
    // want a specific day's rows without over-fetching.
    const startIso = `${parsed.data}T00:00:00.000Z`;
    const endMs = Date.parse(startIso) + 24 * 60 * 60 * 1000;
    const endIso = new Date(endMs).toISOString();
    query = query.gte('entered_at', startIso).lt('entered_at', endIso);
  } else {
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('entered_at', sevenDaysAgoIso);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
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

  const parsed = entryInsertBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Decide `entered_at`: prefer client-provided within the accept window,
  // otherwise let the DB default fill it (`now()`).
  let enteredAt: string | undefined = undefined;
  if (parsed.data.entered_at) {
    const ms = Date.parse(parsed.data.entered_at);
    const now = Date.now();
    if (
      Number.isFinite(ms) &&
      ms <= now + ENTERED_AT_MAX_FUTURE_MS &&
      ms >= now - ENTERED_AT_MAX_PAST_MS
    ) {
      enteredAt = new Date(ms).toISOString();
    }
    // Silently drop the field if outside the window rather than 400ing —
    // clock skew shouldn't block a legitimate meal log. Server clock wins.
  }

  const insert = {
    user_id: user.id,
    meal: parsed.data.meal,
    kcal: parsed.data.kcal,
    raw_input: parsed.data.raw_input ?? null,
    protein_g: parsed.data.protein_g ?? 0,
    carbs_g: parsed.data.carbs_g ?? 0,
    fat_g: parsed.data.fat_g ?? 0,
    ...(enteredAt ? { entered_at: enteredAt } : {}),
  };

  const { data, error } = await supabase
    .from('app_calorie_entries')
    .insert(insert)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ entry: data }, { status: 201 });
}
