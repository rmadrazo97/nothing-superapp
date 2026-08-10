import type { Metadata } from 'next';
import { APP_VERSION } from '@/lib/version';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <article style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <header>
        <h1 className="display-md" style={{ margin: 0 }}>Privacy Policy</h1>
        <p className="caption" style={{ margin: 0, marginTop: 'var(--space-2)' }}>
          Version {APP_VERSION} · Effective 2026-08-10
        </p>
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p>
          Nothing Superapp collects the minimum information needed to run the
          Service. This policy explains what we collect, why, and what we
          don&rsquo;t do with it.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          What we collect
        </h2>
        <ul>
          <li>
            <strong>Account</strong> — email address, an optional display
            name, your locale preference.
          </li>
          <li>
            <strong>Subscription</strong> — Stripe customer ID + subscription
            status (Stripe holds your payment method, we never see the card).
          </li>
          <li>
            <strong>Your logs</strong> — meals you record, workouts you
            complete, pomodoros you finish. Row-level security means only your
            session can read your own rows.
          </li>
          <li>
            <strong>Preferences</strong> — theme, daily calorie goal,
            notifications toggle.
          </li>
          <li>
            <strong>Chat messages</strong> — copilot conversations are
            persisted server-side (row-level security means only your
            session can read your threads). Delete a thread from the
            assistant drawer to remove it permanently.
          </li>
        </ul>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          What we don&rsquo;t collect
        </h2>
        <ul>
          <li>Cookies for advertising. We use only auth-session cookies.</li>
          <li>Analytics fingerprints. No PostHog / Mixpanel / Google Analytics.</li>
          <li>Device identifiers beyond what your browser normally sends.</li>
          <li>Location data.</li>
        </ul>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          Third parties we use
        </h2>
        <ul>
          <li>
            <strong>Supabase</strong> — Postgres + auth. Your data lives here,
            in the EU-West-1 region.
          </li>
          <li>
            <strong>Stripe</strong> — payment processing. Handles your card,
            billing address, receipts.
          </li>
          <li>
            <strong>Moonshot AI (Kimi K2)</strong> — the copilot backend. Your
            question + a JSON summary of your recent app data is sent as prompt
            context; Moonshot processes it to stream a response and does not
            (per their terms) train on customer prompts.
          </li>
          <li>
            <strong>Gym Visual</strong> — exercise animation media hosted from
            their CDN. Loading a Gym mini-app page reveals your IP to their
            server as any web fetch would.
          </li>
        </ul>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          Retention &amp; export
        </h2>
        <p>
          Your data is retained while your subscription is active. Cancel and
          the data stays for 30 days in case you resubscribe, then it&rsquo;s
          deleted. Email us to request an export or immediate deletion:
          jmadrazo7@gmail.com.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          Rights (EU/UK)
        </h2>
        <p>
          You have the right to access, correct, export, and delete your data
          at any time. Contact jmadrazo7@gmail.com and we&rsquo;ll respond
          within 30 days.
        </p>

        <h2 className="display-md" style={{ fontSize: 'var(--text-heading)', marginTop: 'var(--space-6)' }}>
          Contact
        </h2>
        <p>Questions: jmadrazo7@gmail.com</p>
      </section>

      <p className="caption" style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}>
        This is a founder-authored policy. A full legal review by counsel is scheduled before v1.0.
      </p>
    </article>
  );
}
