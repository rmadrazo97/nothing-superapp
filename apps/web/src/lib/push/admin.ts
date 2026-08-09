/**
 * Admin authorization for the /api/admin/* endpoints.
 *
 * Two accepted paths — either wins:
 *   1. The caller is authenticated via Supabase and their email matches
 *      `ADMIN_USER_EMAILS` (comma-separated env var, e.g.
 *      "jmadrazo7@gmail.com,alex@example.com").
 *   2. The request carries an `X-Admin-Secret` header whose value matches
 *      `ADMIN_BROADCAST_SECRET`. This is the machine path used by the
 *      release-broadcaster GitHub Action, which has no user session.
 *
 * Both env vars are optional individually but at least one MUST be set in
 * production or the endpoint will refuse every request.
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type AdminAuthResult =
  | { ok: true; via: 'email' | 'secret'; email?: string }
  | { ok: false; reason: 'unauthorized' | 'forbidden' | 'not_configured' };

function parseAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_USER_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function authorizeAdmin(request: Request): Promise<AdminAuthResult> {
  const secret = process.env.ADMIN_BROADCAST_SECRET;
  const headerSecret = request.headers.get('x-admin-secret');
  if (secret && headerSecret && timingSafeEq(secret, headerSecret)) {
    return { ok: true, via: 'secret' };
  }

  const emails = parseAdminEmails();
  if (emails.size === 0 && !secret) {
    return { ok: false, reason: 'not_configured' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'unauthorized' };
  const email = (user.email ?? '').toLowerCase();
  if (!email || !emails.has(email)) return { ok: false, reason: 'forbidden' };
  return { ok: true, via: 'email', email };
}

/**
 * Constant-time string comparison — avoids leaking the secret through
 * request-timing side channels. Falls back to a length-independent loop.
 */
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still walk `a` so timing is roughly length-of-a either way.
    let diff = 1;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i);
    return diff === 0; // always false, but avoids obvious short-circuit.
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
