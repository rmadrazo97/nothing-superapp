/**
 * POST /api/admin/broadcast — fan-out a push notification to every
 * subscription whose owner has opted into the given topic.
 *
 * Body:
 *   {
 *     topic: 'releases' | 'insights',   // validated against enum
 *     version?: string,                  // optional dedupe key
 *     title: string,
 *     body: string,
 *     url?: string,
 *   }
 *
 * Auth: `authorizeAdmin` — accepts either an admin email session OR a
 * matching `X-Admin-Secret` header (used by the release GitHub Action).
 *
 * Dedupe: `push_broadcasts` has a unique index on (topic, version) when
 * version is not null. Duplicate insert → 23505 → we return 409 without
 * fanning out. This is the guard against re-runs of the workflow firing
 * the same release notification twice.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseService } from '@/lib/supabase/service';
import { authorizeAdmin } from '@/lib/push/admin';
import { broadcastPush } from '@/lib/push/server';
import { pushTopicEnum } from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  topic: pushTopicEnum,
  version: z.string().min(1).max(50).optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(500),
  url: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const auth = await authorizeAdmin(request);
  if (!auth.ok) {
    const status =
      auth.reason === 'unauthorized' ? 401 : auth.reason === 'not_configured' ? 500 : 403;
    return NextResponse.json({ error: auth.reason }, { status });
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
      { status: 400 },
    );
  }

  const { topic, version, title, body: notifBody, url } = parsed.data;

  // Reserve the broadcast row FIRST — the unique index on (topic, version)
  // is our dedupe. If a re-deploy tries to broadcast the same version
  // again, we bail here before touching the send fan-out.
  const svc = supabaseService();
  const { data: reserved, error: reserveErr } = await svc
    .from('push_broadcasts')
    .insert({
      topic,
      version: version ?? null,
      title,
      body: notifBody,
      url: url ?? null,
    })
    .select('id')
    .single();

  if (reserveErr) {
    // Postgres unique_violation
    if (reserveErr.code === '23505') {
      return NextResponse.json(
        { error: 'already_sent', topic, version },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: 'db_error', message: reserveErr.message },
      { status: 500 },
    );
  }

  const broadcastId = reserved.id as string;

  let result;
  try {
    result = await broadcastPush(
      { title, body: notifBody, url, tag: version ? `release-${version}` : `topic-${topic}` },
      { onlySubscribedTo: topic },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send_failed';
    // Mark this broadcast row as a total failure so the retry story is
    // clear (operator can delete it + retry). We still return 500.
    await svc
      .from('push_broadcasts')
      .update({ failed_count: -1 })
      .eq('id', broadcastId);
    return NextResponse.json({ error: 'send_failed', message }, { status: 500 });
  }

  await svc
    .from('push_broadcasts')
    .update({ sent_count: result.sent, failed_count: result.failed + result.gone })
    .eq('id', broadcastId);

  return NextResponse.json({
    broadcast_id: broadcastId,
    ...result,
    via: auth.via,
  });
}
