/**
 * /api/copilot/threads
 *
 * GET  — list the current user's non-archived threads, most recent first.
 * POST — create a new thread. Client optionally supplies `context` (scope)
 *        and `title` (else a default is used; the /api/copilot POST will
 *        auto-title from the first user message on the first turn).
 *
 * Owner-only via Supabase RLS + explicit `user_id = auth.uid()` writes.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  copilotThreadInsertSchema,
  type CopilotThread,
} from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Cap the number of active threads returned in a single request. Users with
// many old threads still get the freshest 100; older threads can be surfaced
// via a paginated endpoint later.
const LIST_LIMIT = 100;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { data, error } = await supabase
    .from('copilot_threads')
    .select('id, user_id, title, context, last_message_at, archived_at, created_at, updated_at')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  }
  const threads = (data ?? []) as CopilotThread[];
  return NextResponse.json({ threads });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty POST body = accept defaults.
    body = {};
  }
  const parsed = copilotThreadInsertSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', detail: parsed.error.issues },
      { status: 400 },
    );
  }
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('copilot_threads')
    .insert({
      user_id: user.id,
      title: parsed.data.title ?? 'New chat',
      context: parsed.data.context ?? null,
      last_message_at: nowIso,
    })
    .select('id, user_id, title, context, last_message_at, archived_at, created_at, updated_at')
    .single();
  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ thread: data as CopilotThread }, { status: 201 });
}
