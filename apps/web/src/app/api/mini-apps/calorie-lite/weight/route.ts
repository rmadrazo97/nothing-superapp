/**
 * GET    /api/mini-apps/calorie-lite/weight
 * POST   /api/mini-apps/calorie-lite/weight
 * DELETE /api/mini-apps/calorie-lite/weight?id=<uuid>
 *
 * Backend for the calorie-lite WEIGHT sub-mini-app.
 *
 *   GET    — default: last 30 days of the caller's `weight_entries` ordered
 *            by `entered_at DESC`. Accepts `?limit=N` (1..500) to override
 *            the row cap when the client wants a specific window.
 *   POST   — inserts a single weight datapoint. Body: `{ weight_kg: number,
 *            note?: string }`. `user_id` is server-set; NEVER trusted from
 *            client. Stored in kg always — the UI converts to lb per the
 *            `weight_unit` preference before display.
 *   DELETE — hard-deletes a single entry by id (owner-only via RLS + explicit
 *            `.eq('user_id')` filter). Soft-delete not required for v1.
 *
 * Auth-gated (401) AND entitlement-gated (402) — same defence-in-depth as
 * the calorie /entries route.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';
import { weightEntryInsertSchema } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const idParamSchema = z.string().uuid();
const limitParamSchema = z.coerce.number().int().min(1).max(500);

const SELECT_COLUMNS = 'id, user_id, weight_kg, note, entered_at';

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
  const limitParam = url.searchParams.get('limit');

  let query = supabase
    .from('weight_entries')
    .select(SELECT_COLUMNS)
    .eq('user_id', user.id)
    .order('entered_at', { ascending: false });

  if (limitParam !== null) {
    const parsed = limitParamSchema.safeParse(limitParam);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_limit' }, { status: 400 });
    }
    query = query.limit(parsed.data);
  } else {
    // Default window: last 30 days. Cap at 500 rows so a user who logs
    // multiple weigh-ins per day can't blow up the payload.
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('entered_at', thirtyDaysAgoIso).limit(500);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // `numeric(6,2)` comes back as a string on some drivers — normalize once
  // here so downstream code never has to defensive-cast.
  const normalized = (data ?? []).map((row: { weight_kg: number | string } & Record<string, unknown>) => ({
    ...row,
    weight_kg: typeof row.weight_kg === 'string' ? Number(row.weight_kg) : row.weight_kg,
  }));

  return NextResponse.json({ entries: normalized });
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

  const parsed = weightEntryInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const insert = {
    user_id: user.id,
    weight_kg: parsed.data.weight_kg,
    note: parsed.data.note ?? null,
  };

  const { data, error } = await supabase
    .from('weight_entries')
    .insert(insert)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const normalized = {
    ...data,
    weight_kg:
      typeof (data as { weight_kg: number | string }).weight_kg === 'string'
        ? Number((data as { weight_kg: string }).weight_kg)
        : (data as { weight_kg: number }).weight_kg,
  };

  return NextResponse.json({ entry: normalized }, { status: 201 });
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
    .from('weight_entries')
    .delete()
    .eq('user_id', user.id)
    .eq('id', parsedId.data);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
