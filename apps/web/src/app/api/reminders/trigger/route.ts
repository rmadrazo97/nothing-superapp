/**
 * POST /api/reminders/trigger — user-initiated single-reminder fire.
 *
 * Used by the "▶ Run now" chip on each row. Auth: user session (not the
 * cron secret). Fires the reminder immediately via fireReminder(); agent
 * loops run synchronously in this path so the caller can wait for the
 * result — but bounded by maxDuration.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { supabaseService } from '@/lib/supabase/service';
import { fireReminder } from '@/lib/ai/agent-loops';
import type { Reminder } from '@nothing/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  reminder_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // RLS-safe fetch: user's own reminder only.
  const { data: row, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('id', parsed.reminder_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'db_error', details: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Bypass RLS for the fire (service role) — we already proved ownership.
  const svc = supabaseService();
  const { data: freshRow } = await svc
    .from('reminders')
    .select('*')
    .eq('id', parsed.reminder_id)
    .maybeSingle();
  if (!freshRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const outcome = await fireReminder(freshRow as Reminder, { agentBackground: false });
  return NextResponse.json({ outcome });
}
