/**
 * DELETE /api/mini-apps/calorie-lite/favorites/[id]
 *
 * v3 MFP-tier Wave 2-B: remove a favorite. RLS on `food_favorites` is
 * owner-only; the explicit `.eq('user_id', user.id)` is belt-and-suspenders.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, isEntitled } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const idSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await ctx.params;
  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { entitlement } = await getEntitlement(user.id, supabase);
  if (!isEntitled(entitlement)) {
    return NextResponse.json(
      { error: 'payment_required', entitlement },
      { status: 402 },
    );
  }

  const { error } = await supabase
    .from('food_favorites')
    .delete()
    .eq('id', idParsed.data)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
