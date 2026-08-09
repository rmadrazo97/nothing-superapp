/**
 * POST /api/push/subscribe — save a browser PushSubscription for the
 * authenticated user.
 *
 * Body is the raw output of `pushManager.subscribe().toJSON()`, i.e.
 *   { endpoint, expirationTime, keys: { p256dh, auth } }
 *
 * Behaviour:
 *   - Upsert on `endpoint` (natural dedupe key). Re-subscribing from the
 *     same install refreshes keys + last_seen_at + user_id (in case the
 *     user switched accounts on this device).
 *   - Flip `preferences.push_enabled = true` — persists the "yes on this
 *     account" signal so we don't re-prompt the banner.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { pushSubscriptionJsonSchema } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = pushSubscriptionJsonSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null;

  // Upsert on endpoint — the natural dedupe key. If the same install
  // re-subscribes we refresh keys + last_seen_at + user_id atomically.
  const { data: subRow, error: subErr } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: userAgent,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
    .select('id, endpoint, created_at, last_seen_at')
    .single();

  if (subErr) {
    return NextResponse.json(
      { error: 'db_error', message: subErr.message },
      { status: 500 },
    );
  }

  // Best-effort flip of push_enabled — don't fail the whole request if the
  // preferences upsert stumbles; the subscription is the source of truth
  // for delivery. RLS scopes this to the caller by construction.
  await supabase
    .from('preferences')
    .upsert({ user_id: user.id, push_enabled: true }, { onConflict: 'user_id' });

  return NextResponse.json({ subscription: subRow });
}
