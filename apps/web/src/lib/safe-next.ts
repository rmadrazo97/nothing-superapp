/**
 * safe-next — shared helper for validating a `?next=` redirect target.
 *
 * Both the Proxy (middleware) and the auth-callback route accept a `next`
 * search param so that a user bounced off a gated URL lands back where they
 * were trying to go, not on the generic `/app` grid. The value comes from
 * the URL though — an attacker can craft a `?next=https://evil.example.com`
 * link, so we lock it down to same-origin paths that start with one of a
 * short allow-list.
 *
 * Rules:
 *   - Must be a string
 *   - Must start with `/` (relative, same-origin only — never accept
 *     `//host/path` or `https://host/path`, both of which would leak to
 *     a foreign origin under RFC 3986 URL parsing)
 *   - Must start with one of the ALLOW_PREFIXES (`/app` or `/paywall`)
 *   - Empty or malformed → fall back to `/app`
 *
 * Preserves any existing query string on the target path (so
 * `/paywall?ref=abc` round-trips through sign-in intact).
 */

const ALLOW_PREFIXES = ['/app', '/paywall'] as const;
const DEFAULT_DEST = '/app';

export function safeNext(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_DEST;
  // Reject protocol-relative (`//example.com/x`) and absolute-URL forms.
  if (!raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_DEST;
  // Split off the query/hash — we only guard the pathname, but we keep the
  // rest attached in the return so callers can pass it straight to a
  // redirect.
  const pathOnly = raw.split(/[?#]/, 1)[0] ?? raw;
  const ok = ALLOW_PREFIXES.some(
    (p) => pathOnly === p || pathOnly.startsWith(`${p}/`),
  );
  return ok ? raw : DEFAULT_DEST;
}
