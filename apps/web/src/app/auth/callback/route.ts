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

  // Profile row bootstrapping used to live here as an idempotent upsert, but
  // the code referenced columns (email, subscription_status) that don't exist
  // on the `profiles` schema — silent failure meant Google-OAuth users landed
  // at /app with no profile row, which broke Save Profile in Settings.
  //
  // Moved to a DB trigger in migration 004 (`on_auth_user_created` fires on
  // insert into auth.users → inserts a matching profiles row via
  // handle_new_user()). Bulletproof, provider-agnostic, and impossible to
  // forget when adding a new auth flow.

  return NextResponse.redirect(`${origin}${next}`);
}
