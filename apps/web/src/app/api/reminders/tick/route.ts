/**
 * POST /api/reminders/tick — Vercel Cron entry point.
 *
 * Runs every 5 minutes (see apps/web/vercel.json). Fetches every active
 * reminder whose `next_fire_at` is due, fires each one, updates timestamps.
 *
 * Auth: two accepted paths — Vercel's `x-vercel-cron-signature` header OR
 * an explicit `Authorization: Bearer $CRON_SECRET`. Unauthenticated hits
 * get a 401 (defence in depth — RLS bypass runs with service_role here).
 *
 * Agent-loop reminders are queued with `after()` so slow Kimi calls don't
 * block the whole tick's response inside the Vercel serverless budget.
 */
import { NextResponse } from 'next/server';
import type { Reminder } from '@nothing/shared';
import { supabaseService } from '@/lib/supabase/service';
import { fireReminder } from '@/lib/ai/agent-loops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  // Vercel Cron: header injected by the platform.
  const cronSig = req.headers.get('x-vercel-cron-signature');
  if (cronSig && cronSig.length > 0) return true;
  const cronHeader = req.headers.get('x-vercel-cron');
  if (cronHeader === '1') return true;
  // Manual + pg_cron fallback: bearer secret.
  const auth = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (expected && auth === `Bearer ${expected}`) return true;
  return false;
}

async function handle(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const svc = supabaseService();
  const now = new Date();

  const { data: due, error } = await svc
    .from('reminders')
    .select('*')
    .eq('active', true)
    .lte('next_fire_at', now.toISOString())
    .not('next_fire_at', 'is', null)
    .order('next_fire_at', { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'db_error', details: error.message }, { status: 500 });
  }

  const rows = (due ?? []) as Reminder[];
  let notified = 0;
  let agent_run = 0;
  let errors = 0;
  for (const r of rows) {
    try {
      const outcome = await fireReminder(r, { agentBackground: true });
      if (outcome.status === 'ok' && outcome.kind === 'notify') notified += 1;
      if (outcome.status === 'ok' && outcome.kind === 'agent_loop') agent_run += 1;
      if (outcome.status === 'error') errors += 1;
    } catch (err) {
      errors += 1;
      // eslint-disable-next-line no-console
      console.error('[reminders/tick] fire failed', r.id, err);
    }
  }

  return NextResponse.json({
    processed: rows.length,
    notified,
    agent_run,
    errors,
    ts: now.toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
