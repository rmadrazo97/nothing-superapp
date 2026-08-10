/**
 * Public marketing landing — served at `/` to signed-out visitors.
 *
 * v0.5.1: previously `/` was a hard redirect (auth → /app, else → /login).
 * That worked for the seed user base but meant curious visitors + press +
 * app-store crawlers only ever saw the sign-in form. This lands them on a
 * proper "here's what Nothing Superapp is" page instead.
 *
 * Signed-in users still get bounced to `/app` — no reason to make them
 * scroll a landing to reach their tools.
 *
 * Server Component. Reads the installed mini-app registry so the "here's
 * everything you get" list stays in sync with what actually ships (no
 * hand-maintained marketing copy). No hex, tokens only.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadInstalledMiniApps } from '@/lib/mini-apps/registry';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect('/app');
  }

  const miniApps = await loadInstalledMiniApps();
  // Filter out the coming-soon placeholder from the marketing tile list —
  // it's meaningful inside the launcher (a wink) but noise on the landing.
  const realApps = miniApps.filter((m) => m.slug !== 'coming-soon');

  return (
    <main
      style={{
        minHeight: '100dvh',
        padding:
          'calc(var(--space-8) + env(safe-area-inset-top)) calc(var(--space-4) + env(safe-area-inset-right)) calc(var(--space-8) + env(safe-area-inset-bottom)) calc(var(--space-4) + env(safe-area-inset-left))',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 560,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-8)',
        }}
      >
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <p
            className="label"
            style={{ margin: 0, color: 'var(--color-text-secondary)' }}
          >
            NOTHING SUPERAPP
          </p>
          <h1
            className="display-md"
            style={{
              margin: 0,
              fontSize: 'var(--text-display-lg)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            One subscription.
            <br />
            Every tool.
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            A Swiss-army-knife app with a calmer aesthetic. Meals, workouts,
            focus timers, reminders — plus an assistant that reads across all
            of it. $1 / month. Cancel anytime.
          </p>
        </header>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <Link
            href="/login"
            style={{
              padding: 'var(--space-3) var(--space-6)',
              background: 'var(--color-accent)',
              color: 'var(--color-text-display)',
              border: 0,
              borderRadius: 'var(--radius-button)',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 'var(--text-body)',
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            Get started — $1 / month
          </Link>
          <Link
            href="/login"
            style={{
              padding: 'var(--space-3) var(--space-6)',
              background: 'transparent',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-button)',
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              fontSize: 'var(--text-body)',
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            Sign in
          </Link>
        </div>

        <section
          aria-labelledby="whats-inside"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <h2
            id="whats-inside"
            className="label"
            style={{
              margin: 0,
              color: 'var(--color-text-secondary)',
            }}
          >
            WHAT'S INSIDE
          </h2>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {realApps.map((app) => (
              <li
                key={app.slug}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-card)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 'var(--text-heading)',
                    lineHeight: 1,
                  }}
                >
                  {app.icon}
                </span>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-body)',
                      color: 'var(--color-text-display)',
                      fontWeight: 500,
                    }}
                  >
                    {app.name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-body-sm)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {app.description}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <footer
          style={{
            display: 'flex',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
            color: 'var(--color-text-disabled)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-caption)',
          }}
        >
          <Link
            href="/legal/terms"
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >
            Terms
          </Link>
          <Link
            href="/legal/privacy"
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >
            Privacy
          </Link>
        </footer>
      </section>
    </main>
  );
}
