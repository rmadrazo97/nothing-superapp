/**
 * Server-only Supabase client that uses the `service_role` key.
 *
 * BYPASSES ROW LEVEL SECURITY — use only from trusted server code (webhook
 * handlers, cron jobs, etc.) where the user identity is proven via some other
 * mechanism (e.g. Stripe signature verification).
 *
 * NEVER import from client components or from anything that ships to the
 * browser. If you need per-user reads, use `createServerClient` from
 * `./server.ts` instead — that respects RLS via the user's session cookie.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function supabaseService(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (server env)',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
