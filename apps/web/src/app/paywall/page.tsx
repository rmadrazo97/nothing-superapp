'use client';

/**
 * /paywall — subscription upsell + status page.
 *
 * Reached when:
 *   - Proxy redirects a signed-in-but-unentitled user off a `/app/*`
 *     mini-app route (assistant + settings are excluded — see proxy.ts).
 *   - A settings or upsell CTA links here directly.
 *
 * Renders either:
 *   - The Subscribe CTA (posts to /api/stripe/checkout → window.location = url)
 *     when entitlement !== 'active' | 'trialing'.
 *   - A "You're subscribed" confirmation with a link back to /app when the
 *     user already has an entitlement.
 *
 * Styled with design-system tokens only — no hex, no rgba beyond the
 * card-scrim (same pattern as /login).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useEntitlement } from '@/lib/hooks/use-entitlement';

type CheckoutState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'error'; message: string };

export default function PaywallPage() {
  const { entitlement, subscription, isLoading } = useEntitlement();
  const [checkout, setCheckout] = useState<CheckoutState>({ kind: 'idle' });

  const entitled = entitlement === 'active' || entitlement === 'trialing';

  const startCheckout = async () => {
    setCheckout({ kind: 'starting' });
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setCheckout({
          kind: 'error',
          message: body.error ?? 'Could not start checkout. Please try again.',
        });
        return;
      }
      window.location.href = body.url;
    } catch {
      setCheckout({
        kind: 'error',
        message: 'Network error — please try again.',
      });
    }
  };

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
        aria-labelledby="paywall-title"
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--color-border-visible)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <header
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
        >
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
            id="paywall-title"
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
            {entitled ? "You're subscribed" : 'Unlock everything'}
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {entitled
              ? 'Full access to every mini-app and the assistant.'
              : 'One subscription. Every tool. Cancel anytime.'}
          </p>
        </header>

        {isLoading ? (
          <p
            role="status"
            style={{
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-text-disabled)',
            }}
          >
            Loading your status…
          </p>
        ) : entitled ? (
          <EntitledView
            status={entitlement}
            currentPeriodEnd={subscription?.current_period_end ?? null}
            cancelAtPeriodEnd={subscription?.cancel_at_period_end ?? false}
          />
        ) : (
          <UnentitledView
            status={checkout.kind}
            onSubscribe={startCheckout}
          />
        )}

        {checkout.kind === 'error' ? (
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
            {checkout.message}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function UnentitledView({
  status,
  onSubscribe,
}: {
  status: CheckoutState['kind'];
  onSubscribe: () => void;
}) {
  const starting = status === 'starting';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <PriceBlock />

      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-text-primary)',
        }}
      >
        <FeatureRow>Every mini-app in the grid</FeatureRow>
        <FeatureRow>Assistant that remembers your context</FeatureRow>
        <FeatureRow>Cancel anytime — access lasts through your paid period</FeatureRow>
      </ul>

      <button
        type="button"
        onClick={onSubscribe}
        disabled={starting}
        style={{
          padding: 'var(--space-3) var(--space-6)',
          background: 'var(--color-accent)',
          color: 'var(--color-text-display)',
          border: 'none',
          borderRadius: 'var(--radius-button)',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: 'var(--text-body)',
          cursor: starting ? 'not-allowed' : 'pointer',
          opacity: starting ? 0.6 : 1,
          transition: 'opacity var(--dur-fast) var(--ease-out)',
        }}
      >
        {starting ? 'Redirecting…' : 'Subscribe — $1 / month'}
      </button>

      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-caption)',
          color: 'var(--color-text-disabled)',
          textAlign: 'center',
        }}
      >
        Secured by Stripe. You can still reach the assistant and settings while
        unsubscribed.
      </p>
    </div>
  );
}

function EntitledView({
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd,
}: {
  status: 'active' | 'trialing';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  const renews = currentPeriodEnd ? formatDate(currentPeriodEnd) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div
        style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-accent-subtle)',
          border: '1px solid var(--color-border-visible)',
          borderRadius: 'var(--radius-compact)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-text-primary)',
        }}
      >
        <p style={{ margin: 0 }}>
          {status === 'trialing' ? 'Trial active.' : 'Subscription active.'}
        </p>
        {renews ? (
          <p
            style={{
              margin: 0,
              marginTop: 'var(--space-1)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {cancelAtPeriodEnd ? 'Ends ' : 'Renews '}
            {renews}.
          </p>
        ) : null}
      </div>

      <Link
        href="/app"
        style={{
          padding: 'var(--space-3) var(--space-6)',
          background: 'var(--color-accent)',
          color: 'var(--color-text-display)',
          border: 'none',
          borderRadius: 'var(--radius-button)',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: 'var(--text-body)',
          textDecoration: 'none',
          textAlign: 'center',
          transition: 'opacity var(--dur-fast) var(--ease-out)',
        }}
      >
        Go to your apps
      </Link>

      <Link
        href="/app/settings"
        style={{
          padding: 'var(--space-3) var(--space-6)',
          background: 'transparent',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-visible)',
          borderRadius: 'var(--radius-button)',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: 'var(--text-body)',
          textDecoration: 'none',
          textAlign: 'center',
          transition: 'opacity var(--dur-fast) var(--ease-out)',
        }}
      >
        Manage subscription
      </Link>
    </div>
  );
}

function PriceBlock() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--space-2)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 'var(--font-display-weight)' as unknown as number,
          fontSize: 'var(--text-display-lg)',
          color: 'var(--color-text-display)',
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        $1
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-text-secondary)',
        }}
      >
        / month
      </span>
    </div>
  );
}

function FeatureRow({ children }: { children: React.ReactNode }) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
      }}
    >
      <span
        aria-hidden
        style={{
          flex: '0 0 auto',
          marginTop: '0.35em',
          width: 'var(--space-2)',
          height: 'var(--space-2)',
          background: 'var(--color-accent)',
          borderRadius: 'var(--radius-compact)',
        }}
      />
      <span>{children}</span>
    </li>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
