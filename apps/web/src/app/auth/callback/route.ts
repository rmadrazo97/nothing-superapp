/**
 * OAuth / magic-link callback.
 *
 * Supabase redirects the browser here with `?code=<pkce-code>` after either:
 *   - the user clicked the magic-link in their inbox, or
 *   - the user completed a Google OAuth flow.
 *
 * We exchange the code for a session (which writes the session cookie via
 * our server client's cookie adapter), then idempotently upsert a `profiles`
 * row for first-time users, then redirect them into the app.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/app';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  // Bootstrap the profile row for first-time sign-ins. Idempotent via upsert
  // on the primary key so returning users don't overwrite their own data.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Insert-if-missing only — do NOT overwrite existing rows, otherwise a
    // returning user's subscription_status would get reset to 'inactive' on
    // every sign-in. Column default at the DB layer handles the initial
    // status. `ignoreDuplicates: true` makes Postgres skip conflicting rows.
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        { id: user.id, email: user.email, subscription_status: 'inactive' },
        { onConflict: 'id', ignoreDuplicates: true },
      );

    if (profileError) {
      // Non-fatal — surface for observability but let the user in.
      console.error('[auth/callback] profile upsert failed', profileError);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
