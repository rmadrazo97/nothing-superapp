/**
 * GET  /api/mini-apps/calorie-lite/water
 * POST /api/mini-apps/calorie-lite/water
 *
 * Backend for the calorie-lite WATER sub-mini-app.
 *
 *   GET  — default: last 7 days of the caller's `water_entries`, ordered by
 *          `entered_at DESC`. Accepts `?date=YYYY-MM-DD` to fetch a single
 *          local-UTC-day's rows (used for the "today only" quick-list).
 *   POST — inserts a single water intake row. Body: `{ ml: number }`.
 *          `user_id` is server-set from the session cookie; NEVER trusted
 *          from the client. `entered_at` defaults to `now()` in the DB.
 *
 * Both handlers are auth-gated (401) AND entitlement-gated (402) — mirrors
 * the calorie /entries route. Proxy already redirects unentitled users at
 * `/app/calorie-lite`, so 402 here is defence-in-depth for direct callers.
 *
 * RLS on `water_entries` enforces owner-only access at the DB layer; the
 * explicit `.eq('user_id', user.id)` filter is belt-and-suspenders.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { waterEntryInsertSchema } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const dateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const idParamSchema = z.string().uuid();

const SELECT_COLUMNS = 'id, user_id, ml, entered_at';

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');

  let query = supabase
    .from('water_entries')
    .select(SELECT_COLUMNS)
    .eq('user_id', user.id)
    .order('entered_at', { ascending: false })
    .limit(500);

  if (dateParam) {
    const parsed = dateParamSchema.safeParse(dateParam);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
    }
    // UTC-day window — matches the calorie /entries GET convention. The
    // client-side aggregator re-buckets by local-day when it needs to.
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

  const parsed = waterEntryInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const insert = {
    user_id: user.id,
    ml: parsed.data.ml,
  };

  const { data, error } = await supabase
    .from('water_entries')
    .insert(insert)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ entry: data }, { status: 201 });
}

export async function DELETE(request: Request) {
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

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const parsedId = idParamSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const { error } = await supabase
    .from('water_entries')
    .delete()
    .eq('user_id', user.id)
    .eq('id', parsedId.data);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
