/**
 * POST /api/push/test — send a test push to the calling user's devices.
 *
 * Zero body. Response: `{ sent, failed, gone }`. Used by the "Send test"
 * button in Settings → Notifications so users can verify delivery works
 * (permission granted, subscription saved, VAPID keys agree) without
 * waiting for the next release broadcast.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/push/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendPushToUser(user.id, {
      title: 'Nothing Superapp',
      body: 'Notifications are on. You will hear from us when it matters.',
      url: '/app/settings',
      tag: 'push-test',
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send_failed';
    return NextResponse.json({ error: 'send_failed', message }, { status: 500 });
  }
}
