import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <article style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <header>
        <h1 className="display-md" style={{ margin: 0 }}>Terms of Service</h1>
        <p className="caption" style={{ margin: 0, marginTop: 'var(--space-2)' }}>
          Version 0.3 · Effective 2026-08-08
        </p>
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p>
          These Terms govern your use of Nothing Superapp (&ldquo;the Service&rdquo;), operated
          by A Cloud Brew Studios. By subscribing or signing in, you agree to
          these Terms.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          The Service
        </h2>
        <p>
          Nothing Superapp is a single-shell utility app that bundles multiple
          mini-apps (nutrition tracking, gym routines, focus timer) and an AI
          copilot behind one $1/mo subscription.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          Subscription &amp; billing
        </h2>
        <p>
          Billing is handled by Stripe. Your subscription renews monthly at
          $1.00 USD until cancelled. Cancel any time from Settings; access
          continues until the current period ends. No refunds for partial
          months.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          Your data
        </h2>
        <p>
          You own the data you create in the Service (meal logs, workouts,
          focus sessions). We store it in Supabase Postgres with row-level
          security so only you can read it. The AI copilot reads your data to
          answer your questions but does not train models on it.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          Media &amp; third-party data
        </h2>
        <p>
          Exercise animation media in the Gym mini-app is provided by{' '}
          <a href="https://gymvisual.com/" target="_blank" rel="noopener noreferrer">
            Gym Visual
          </a>{' '}
          and remains their property. Use it only within the Service.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          Acceptable use
        </h2>
        <p>
          Don&rsquo;t abuse the AI copilot to generate content designed to
          harass, deceive, or harm others. Don&rsquo;t attempt to access other
          users&rsquo; data or the underlying infrastructure. We may suspend
          accounts that violate these rules.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          No warranty
        </h2>
        <p>
          The Service is provided &ldquo;as is.&rdquo; The copilot is helpful but
          not infallible — don&rsquo;t use it as a substitute for medical,
          financial, or legal advice.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          Changes
        </h2>
        <p>
          We may update these Terms. Continued use after an update means you
          accept the new version. Material changes will be announced in-app.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          Contact
        </h2>
        <p>Questions: jmadrazo7@gmail.com</p>
      </section>

      <p className="caption" style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}>
        This is a v0.3 placeholder. A full legal review by counsel is scheduled before v1.0.
      </p>
    </article>
  );
}
