'use client';

import { Suspense, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { safeNext } from '@/lib/safe-next';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Build the auth callback URL, threading `?next=<path>` through so the
 * post-auth handler lands the user back on the page they were trying to
 * reach (e.g. a deep-link into /app/calorie-lite?tab=reports that the
 * Proxy bounced). Passes through `safeNext` first to reject open-redirect
 * attempts. Kept lean so the auth-callback route stays the single place
 * that validates + honours the value.
 */
function buildCallbackUrl(nextParam: string | null): string {
  const next = safeNext(nextParam);
  const base = `${APP_URL}/auth/callback`;
  // `safeNext` returns `/app` for missing/invalid input — no reason to
  // round-trip that through the URL, it's the default on the far side too.
  return next === '/app' ? base : `${base}?next=${encodeURIComponent(next)}`;
}

// Next 16 requires any `useSearchParams()` caller to sit under a
// <Suspense> boundary so the shell can prerender without blocking on
// query-string hydration. The exported LoginPage is a thin wrapper.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');
  const callbackUrl = useMemo(() => buildCallbackUrl(nextParam), [nextParam]);

  const sendMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email) return;
    setStatus({ kind: 'sending' });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl },
    });
    if (error) {
      setStatus({ kind: 'error', message: error.message });
    } else {
      setStatus({ kind: 'sent' });
    }
  };

  const signInWithGoogle = async () => {
    setStatus({ kind: 'sending' });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    });
    if (error) {
      setStatus({ kind: 'error', message: error.message });
    }
    // On success supabase-js triggers a top-level navigation, so no state update.
  };

  const sending = status.kind === 'sending';

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <section
        aria-labelledby="login-title"
        style={{
          width: '100%',
          maxWidth: '400px',
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--color-border-visible)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
            }}
          >
            Nothing Superapp
          </p>
          <h1
            id="login-title"
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--font-display-weight)' as unknown as number,
              fontSize: 'var(--text-display-md)',
              color: 'var(--color-text-display)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            Sign in
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            Enter your email for a magic link, or continue with Google.
          </p>
        </header>

        <form
          onSubmit={sendMagicLink}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <label
            htmlFor="email"
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
            }}
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sending}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-compact)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body)',
              outline: 'none',
            }}
          />

          <button
            type="submit"
            disabled={sending || !email}
            style={{
              padding: 'var(--space-3) var(--space-6)',
              background: 'var(--color-accent)',
              color: 'var(--color-text-display)',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 'var(--text-body)',
              cursor: sending || !email ? 'not-allowed' : 'pointer',
              opacity: sending || !email ? 0.6 : 1,
              transition: 'opacity var(--dur-fast) var(--ease-out)',
            }}
          >
            {sending ? 'Sending…' : 'Send magic link'}
          </button>
        </form>

        <div
          role="separator"
          aria-orientation="horizontal"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            color: 'var(--color-text-disabled)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span
            aria-hidden
            style={{
              flex: 1,
              height: '1px',
              background: 'var(--color-border-visible)',
            }}
          />
          <span>or</span>
          <span
            aria-hidden
            style={{
              flex: 1,
              height: '1px',
              background: 'var(--color-border-visible)',
            }}
          />
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={sending}
          style={{
            padding: 'var(--space-3) var(--space-6)',
            background: 'transparent',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-button)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 'var(--text-body)',
            cursor: sending ? 'not-allowed' : 'pointer',
            opacity: sending ? 0.6 : 1,
            transition: 'opacity var(--dur-fast) var(--ease-out)',
          }}
        >
          Continue with Google
        </button>

        {status.kind === 'sent' ? (
          <p
            role="status"
            style={{
              margin: 0,
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-accent-subtle)',
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-compact)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body-sm)',
            }}
          >
            Check your inbox — we sent a magic link to <strong>{email}</strong>.
          </p>
        ) : null}

        {status.kind === 'error' ? (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: 'var(--space-3) var(--space-4)',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-compact)',
              color: 'var(--color-accent)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body-sm)',
            }}
          >
            {status.message}
          </p>
        ) : null}

        <p
          className="caption"
          style={{
            marginTop: 'var(--space-6)',
            textAlign: 'center',
            color: 'var(--color-text-disabled)',
          }}
        >
          By signing in you agree to our{' '}
          <a
            href="/legal/terms"
            style={{ color: 'var(--color-text-secondary)', textDecoration: 'underline' }}
          >
            Terms
          </a>{' '}
          and{' '}
          <a
            href="/legal/privacy"
            style={{ color: 'var(--color-text-secondary)', textDecoration: 'underline' }}
          >
            Privacy Policy
          </a>
          .
        </p>
      </section>
    </main>
  );
}
