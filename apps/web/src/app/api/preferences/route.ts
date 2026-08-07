/**
 * GET   /api/preferences — read the caller's `preferences` row.
 * PATCH /api/preferences — upsert `preferences` for the caller.
 *
 * Auth-gated via the user's Supabase session cookie. RLS on `preferences`
 * enforces owner-only access. `user_id` is server-set from the session and
 * NEVER trusted from the client.
 *
 * Table shape (per packages/shared/src/schemas/index.ts):
 *   user_id (uuid, PK), notifications_enabled (bool), theme ('dark'|'light'),
 *   daily_calorie_goal (int|null), updated_at (timestamptz)
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const preferencesPatchSchema = z
  .object({
    notifications_enabled: z.boolean().optional(),
    theme: z.enum(['dark', 'light']).optional(),
    daily_calorie_goal: z.number().int().positive().max(20000).nullable().optional(),
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
    .from('preferences')
    .select('user_id, notifications_enabled, theme, daily_calorie_goal, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ preferences: data });
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

  const parsed = preferencesPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'empty_patch' }, { status: 400 });
  }

  // Upsert on user_id so first-time save creates the row; subsequent saves
  // patch it. Server always owns `user_id`.
  const { data, error } = await supabase
    .from('preferences')
    .upsert(
      { user_id: user.id, ...parsed.data },
      { onConflict: 'user_id' },
    )
    .select('user_id, notifications_enabled, theme, daily_calorie_goal, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ preferences: data });
}
