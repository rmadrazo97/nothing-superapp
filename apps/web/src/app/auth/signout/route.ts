/**
 * POST /auth/signout — clears the Supabase session cookie and redirects home.
 * Callable from a plain <form action="/auth/signout" method="post"> so no
 * client JS is required to log out.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
