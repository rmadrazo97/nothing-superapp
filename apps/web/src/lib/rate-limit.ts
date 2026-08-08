/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Adequate for a single-process Next dev / a single Vercel serverless
 * instance. Under multi-instance production traffic, each instance keeps its
 * own window — a determined caller can multiply their allowance by the
 * instance fan-out. That's acceptable at v0.3 for a $1/mo product with a
 * small user base; swap for Upstash/Redis behind the same signature when
 * that matters (see references/prod-rate-limit.md TODO).
 *
 * Usage:
 *   const gate = await limitPerKey(`copilot:${userId}`, 20, 60 * 60 * 1000);
 *   if (!gate.ok) return new Response(..., { status: 429, headers: gate.retryHeaders });
 */

type Window = { count: number; resetAt: number };
const store = new Map<string, Window>();

// Opportunistic sweep so the map doesn't grow unboundedly under key churn.
// Runs every ~500 calls in aggregate — cheap check, no timers.
let calls = 0;
function sweep() {
  const now = Date.now();
  for (const [key, win] of store) {
    if (win.resetAt <= now) store.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfterSeconds: number;
  headers: Record<string, string>;
};

export function limitPerKey(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  calls++;
  if (calls % 500 === 0) sweep();

  const now = Date.now();
  const win = store.get(key);

  if (!win || win.resetAt <= now) {
    const fresh: Window = { count: 1, resetAt: now + windowMs };
    store.set(key, fresh);
    return {
      ok: true,
      remaining: limit - 1,
      limit,
      resetAt: fresh.resetAt,
      retryAfterSeconds: 0,
      headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(limit - 1),
        'X-RateLimit-Reset': String(Math.ceil(fresh.resetAt / 1000)),
      },
    };
  }

  win.count++;
  const remaining = Math.max(0, limit - win.count);
  const retryAfterSeconds = Math.max(0, Math.ceil((win.resetAt - now) / 1000));
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(win.resetAt / 1000)),
  };
  if (win.count > limit) {
    headers['Retry-After'] = String(retryAfterSeconds);
  }
  return {
    ok: win.count <= limit,
    remaining,
    limit,
    resetAt: win.resetAt,
    retryAfterSeconds,
    headers,
  };
}
