/**
 * GET  /api/profile — read the caller's `profiles` row.
 * PATCH /api/profile — update `display_name` (and, when it's a column, avatar).
 *
 * Auth-gated via the user's Supabase session cookie. RLS on `profiles` also
 * enforces owner-only access as defence-in-depth.
 *
 * Client-writable columns: `display_name`, `locale`. The client is NEVER
 * allowed to set `id`, `email`, `subscription_status`, or `created_at` — those
 * are stripped from any incoming body before the update.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Inline patch schema — deliberately narrower than `profileSchema` in
// @nothing/shared. Only these keys may cross the trust boundary from client.
const profilePatchSchema = z
  .object({
    display_name: z.string().trim().max(80).nullable().optional(),
    locale: z.string().trim().min(2).max(16).optional(),
    // IANA timezone (e.g. 'America/Mexico_City'). Captured from
    // Intl.DateTimeFormat().resolvedOptions().timeZone on the client. See
    // migration 024_profile_timezone.sql for the persistence layer + the
    // /api/copilot route for how it's injected into reminder scheduling.
    timezone: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .strict();

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, locale, timezone, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({
    profile: data,
    // Convenience: `profiles` doesn't store the email (Supabase auth owns it);
    // surface it from the auth user so the client can render it read-only.
    email: user.email ?? null,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = profilePatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
  }

  // Upsert (not update) so a missing profile row self-heals. Belt to the
  // migration-004 trigger's suspenders — if the trigger is somehow bypassed,
  // the first PATCH still succeeds instead of 500-ing.
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, ...parsed.data },
      { onConflict: 'id' },
    )
    .select('id, display_name, locale, timezone, created_at, updated_at')
    .single();

  if (error) {
    console.error('[api/profile] upsert failed', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
