/**
 * /api/copilot/threads/[id]
 *
 * GET    — full thread + ordered messages
 * PATCH  — rename or archive/unarchive
 * DELETE — soft-delete (archive_at = now())
 *
 * Owner-only via Supabase RLS + explicit user_id filter (defence-in-depth).
 * Deleting is soft so the user can recover a mis-tapped thread; the drawer's
 * two-tap confirm keeps a slip cheap.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  copilotThreadUpdateSchema,
  type CopilotMessage,
  type CopilotThread,
} from '@nothing/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const idSchema = z.string().uuid();

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: thread, error: threadError } = await supabase
    .from('copilot_threads')
    .select('id, user_id, title, context, last_message_at, archived_at, created_at, updated_at')
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .maybeSingle();
  if (threadError) {
    return NextResponse.json({ error: 'db_error', detail: threadError.message }, { status: 500 });
  }
  if (!thread) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: msgRows, error: msgError } = await supabase
    .from('copilot_messages')
    .select('id, thread_id, user_id, role, parts, created_at')
    .eq('thread_id', parsedId.data)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (msgError) {
    return NextResponse.json({ error: 'db_error', detail: msgError.message }, { status: 500 });
  }

  return NextResponse.json({
    thread: thread as CopilotThread,
    messages: (msgRows ?? []) as CopilotMessage[],
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

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
  const parsed = copilotThreadUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.archived === true) patch.archived_at = new Date().toISOString();
  if (parsed.data.archived === false) patch.archived_at = null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('copilot_threads')
    .update(patch)
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .select('id, user_id, title, context, last_message_at, archived_at, created_at, updated_at')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ thread: data as CopilotThread });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Soft-delete via archived_at. Hard-delete would cascade the messages via
  // the ON DELETE CASCADE FK, but keeping history means the user can undo an
  // accidental delete (planned in a follow-up slice via PATCH archived:false).
  const { data, error } = await supabase
    .from('copilot_threads')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', parsedId.data)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
