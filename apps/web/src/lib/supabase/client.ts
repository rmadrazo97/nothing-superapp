/**
 * Browser Supabase client for use in Client Components ('use client').
 *
 * Reads cookies from document.cookie via the built-in helper, so the session
 * cookie is shared with Server Components / Route Handlers / the Proxy.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  }

  return createBrowserClient(url, anonKey);
}
