/**
 * POST /api/app-requests
 *
 * Accepts a one-line "I wish this app had…" from a signed-in user, stores
 * it in `app_requests` (migration 019). Rate-limited to 5 requests / day /
 * user via the in-memory limiter shared with the copilot endpoint.
 *
 * There is NO GET counterpart — reads happen out of band via the Supabase
 * Studio + service role. The table has no SELECT policy for a reason.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { limitPerKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z
  .object({
    body: z.string().trim().min(1).max(500),
  })
  .strict();

const DAILY_LIMIT = 5;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const gate = limitPerKey(`app-requests:${user.id}`, DAILY_LIMIT, ONE_DAY_MS);
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: `You've sent ${DAILY_LIMIT} requests today. Try again tomorrow.`,
      },
      { status: 429, headers: gate.headers },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400, headers: gate.headers },
    );
  }

  const { data, error } = await supabase
    .from('app_requests')
    .insert({ user_id: user.id, body: parsed.data.body })
    .select('id, created_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'db_error', message: error.message },
      { status: 500, headers: gate.headers },
    );
  }

  return NextResponse.json(
    { ok: true, id: data.id, created_at: data.created_at },
    { headers: gate.headers },
  );
}
