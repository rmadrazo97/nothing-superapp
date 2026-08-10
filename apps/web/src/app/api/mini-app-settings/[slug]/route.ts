/**
 * GET   /api/mini-app-settings/[slug] — read the caller's settings blob
 *                                       for one mini-app. Empty `{}` on
 *                                       row miss so the client never has
 *                                       to special-case "first save".
 * PATCH /api/mini-app-settings/[slug] — shallow-merge the provided keys
 *                                       into the stored jsonb and upsert.
 *
 * One row per (user_id, slug). Free-form jsonb — the mini-app owns its
 * schema; the server only handles storage + owner-scoped reads. RLS on
 * `mini_app_settings` enforces owner-only access; `user_id` is
 * server-set from the session and NEVER trusted from the client.
 *
 * Slug is validated as a short kebab-case-ish identifier to keep bad
 * clients from injecting anything weird into the primary key.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function validSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!validSlug(slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('mini_app_settings')
    .select('settings, updated_at')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({
    slug,
    settings: (data?.settings as Record<string, unknown> | null) ?? {},
    updated_at: data?.updated_at ?? null,
  });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!validSlug(slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }

  let patch: Record<string, unknown>;
  try {
    const raw = (await request.json()) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('non_object');
    }
    patch = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Read-modify-write inside a single request. Not race-safe under heavy
  // concurrent writes from the same user, but per-user settings edits
  // are inherently sequential (one tab, one form). If we grow multi-tab
  // conflict later, we can push the merge into a Postgres function.
  const { data: existing, error: readErr } = await supabase
    .from('mini_app_settings')
    .select('settings')
    .eq('user_id', user.id)
    .eq('slug', slug)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  const current = (existing?.settings as Record<string, unknown> | null) ?? {};
  const merged = { ...current, ...patch };

  const { data, error } = await supabase
    .from('mini_app_settings')
    .upsert(
      {
        user_id: user.id,
        slug,
        settings: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,slug' },
    )
    .select('settings, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({
    slug,
    settings: (data?.settings as Record<string, unknown> | null) ?? {},
    updated_at: data?.updated_at ?? null,
  });
}
