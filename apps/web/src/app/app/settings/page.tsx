'use client';

/**
 * Settings surface (task 11).
 *
 * Four sections stacked in a single dot-grid card column:
 *   1. Profile      — email (read-only) + display_name (editable)
 *   2. Preferences  — dark_mode toggle (surface only, app is always dark)
 *                     + calorie_target used by the calorie-lite mini-app
 *   3. Subscription — reads useEntitlement(); shows manage vs subscribe path
 *   4. Sign out     — plain <form> POST to /auth/signout (no JS needed)
 *
 * All colour + spacing values come from design-system CSS custom properties
 * (see design-system/styles.css). No hex codes in this file. Visual language
 * matches /login (dark card on the dot-grid, --color-border-visible frame).
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useEntitlement } from '@/lib/hooks/use-entitlement';
import { useToast } from '@/lib/toast/context';

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

// ─── shared inline styles (design-system tokens only) ─────────────────────

const CARD_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.5)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const KICKER_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

const SECTION_HEADING_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: 'var(--text-heading)',
  color: 'var(--color-text-display)',
  letterSpacing: '-0.01em',
};

const FIELD_LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-compact)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  outline: 'none',
};

const READONLY_VALUE_STYLE: CSSProperties = {
  ...INPUT_STYLE,
  color: 'var(--color-text-secondary)',
  cursor: 'default',
};

const PRIMARY_BTN_STYLE: CSSProperties = {
  padding: 'var(--space-3) var(--space-6)',
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  border: 'none',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-label)',
  fontWeight: 500,
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: '44px',
  alignSelf: 'flex-start',
  transition: 'opacity var(--dur-fast) var(--ease-out)',
};

const SECONDARY_BTN_STYLE: CSSProperties = {
  padding: 'var(--space-3) var(--space-6)',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-label)',
  fontWeight: 500,
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: '44px',
  alignSelf: 'flex-start',
  transition: 'border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
};

const DESTRUCTIVE_BTN_STYLE: CSSProperties = {
  ...SECONDARY_BTN_STYLE,
  color: 'var(--color-accent)',
  borderColor: 'var(--color-accent)',
};

const STATUS_MSG_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body-sm)',
  color: 'var(--color-text-secondary)',
};

// ─── helpers ──────────────────────────────────────────────────────────────

function formatPeriodEnd(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── page component ───────────────────────────────────────────────────────

export default function SettingsPage() {
  // Profile state
  const [email, setEmail] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileStatus, setProfileStatus] = useState<SaveStatus>({ kind: 'idle' });

  // Preferences state
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [calorieTarget, setCalorieTarget] = useState<number>(2000);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefsStatus, setPrefsStatus] = useState<SaveStatus>({ kind: 'idle' });

  // Subscription — hook lands via task 08
  const { entitlement, subscription, isLoading: entitlementLoading } = useEntitlement();
  const isEntitled = entitlement === 'active' || entitlement === 'trialing';

  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const { toast } = useToast();

  // ── initial loads ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error('profile fetch failed');
        const body = (await res.json()) as {
          profile: { display_name: string | null } | null;
          email: string | null;
        };
        if (cancelled) return;
        setEmail(body.email ?? '');
        setDisplayName(body.profile?.display_name ?? '');
        setProfileLoaded(true);
      } catch {
        if (!cancelled) setProfileLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/preferences', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error('prefs fetch failed');
        const body = (await res.json()) as {
          preferences: {
            theme: 'dark' | 'light';
            daily_calorie_goal: number | null;
          } | null;
        };
        if (cancelled) return;
        if (body.preferences) {
          setDarkMode(body.preferences.theme !== 'light');
          if (typeof body.preferences.daily_calorie_goal === 'number') {
            setCalorieTarget(body.preferences.daily_calorie_goal);
          }
        }
        setPrefsLoaded(true);
      } catch {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── save handlers ──
  const saveProfile = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setProfileStatus({ kind: 'saving' });
      try {
        const res = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            display_name: displayName.trim() === '' ? null : displayName.trim(),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          const errMsg = body.error ?? 'save_failed';
          // 401 → proxy handles on next nav; skip toast.
          if (res.status >= 500) {
            toast.error("Something broke on our end. We're logging it.");
          } else if (res.status === 400) {
            toast.error(`Display name — ${errMsg}`);
          } else if (res.status !== 401) {
            toast.error(errMsg);
          }
          throw new Error(errMsg);
        }
        setProfileStatus({ kind: 'saved' });
      } catch (err) {
        // Network failures (fetch rejects with TypeError). Distinguish
        // from HTTP-shaped errors already toasted above.
        if (err instanceof TypeError) {
          toast.error("Can't reach the server. Check your connection.");
        }
        setProfileStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'save_failed',
        });
      }
    },
    [displayName, toast],
  );

  const savePreferences = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPrefsStatus({ kind: 'saving' });
      try {
        const res = await fetch('/api/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            theme: darkMode ? 'dark' : 'light',
            daily_calorie_goal: Number.isFinite(calorieTarget) ? calorieTarget : 2000,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          const errMsg = body.error ?? 'save_failed';
          if (res.status >= 500) {
            toast.error("Something broke on our end. We're logging it.");
          } else if (res.status === 400) {
            toast.error(`Preferences — ${errMsg}`);
          } else if (res.status !== 401) {
            toast.error(errMsg);
          }
          throw new Error(errMsg);
        }
        setPrefsStatus({ kind: 'saved' });
      } catch (err) {
        if (err instanceof TypeError) {
          toast.error("Can't reach the server. Check your connection.");
        }
        setPrefsStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'save_failed',
        });
      }
    },
    [darkMode, calorieTarget, toast],
  );

  const openPortal = useCallback(async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const errMsg = body.error ?? 'portal_failed';
        if (res.status >= 500) {
          toast.error("Something broke on our end. We're logging it.");
        } else if (res.status !== 401) {
          toast.error(errMsg);
        }
        throw new Error(errMsg);
      }
      const body = (await res.json()) as { url?: string };
      if (!body.url) throw new Error('no_portal_url');
      window.location.assign(body.url);
    } catch (err) {
      if (err instanceof TypeError) {
        toast.error("Can't reach the server. Check your connection.");
      }
      setPortalError(err instanceof Error ? err.message : 'portal_failed');
      setPortalLoading(false);
    }
  }, [toast]);

  // ─── render ───────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <p style={KICKER_STYLE}>Nothing Superapp</p>
        <h1 className="display-md" style={{ margin: 0 }}>
          Settings
        </h1>
      </header>

      {/* ── Profile ── */}
      <section aria-labelledby="section-profile" style={CARD_STYLE}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <p style={KICKER_STYLE}>Section 01</p>
          <h2 id="section-profile" style={SECTION_HEADING_STYLE}>
            Profile
          </h2>
        </div>

        <form
          onSubmit={saveProfile}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label htmlFor="settings-email" style={FIELD_LABEL_STYLE}>
              Email
            </label>
            <input
              id="settings-email"
              type="email"
              value={email}
              readOnly
              disabled
              aria-describedby="settings-email-hint"
              style={READONLY_VALUE_STYLE}
            />
            <p id="settings-email-hint" style={{ ...STATUS_MSG_STYLE, fontSize: 'var(--text-caption)' }}>
              Managed by your sign-in provider.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label htmlFor="settings-display-name" style={FIELD_LABEL_STYLE}>
              Display name
            </label>
            <input
              id="settings-display-name"
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (profileStatus.kind !== 'idle') setProfileStatus({ kind: 'idle' });
              }}
              disabled={!profileLoaded || profileStatus.kind === 'saving'}
              maxLength={80}
              placeholder="What should we call you?"
              style={INPUT_STYLE}
            />
          </div>

          <button
            type="submit"
            disabled={!profileLoaded || profileStatus.kind === 'saving'}
            style={{
              ...PRIMARY_BTN_STYLE,
              opacity: !profileLoaded || profileStatus.kind === 'saving' ? 0.6 : 1,
              cursor:
                !profileLoaded || profileStatus.kind === 'saving' ? 'not-allowed' : 'pointer',
            }}
          >
            {profileStatus.kind === 'saving' ? 'Saving…' : 'Save profile'}
          </button>

          {profileStatus.kind === 'saved' ? (
            <p role="status" style={STATUS_MSG_STYLE}>
              Saved.
            </p>
          ) : null}
          {profileStatus.kind === 'error' ? (
            <p role="alert" style={{ ...STATUS_MSG_STYLE, color: 'var(--color-accent)' }}>
              Couldn&apos;t save — {profileStatus.message}
            </p>
          ) : null}
        </form>
      </section>

      {/* ── Preferences ── */}
      <section aria-labelledby="section-preferences" style={CARD_STYLE}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <p style={KICKER_STYLE}>Section 02</p>
          <h2 id="section-preferences" style={SECTION_HEADING_STYLE}>
            Preferences
          </h2>
        </div>

        <form
          onSubmit={savePreferences}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          <label
            htmlFor="settings-dark-mode"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={FIELD_LABEL_STYLE}>Dark mode</span>
              <span style={{ ...STATUS_MSG_STYLE, fontSize: 'var(--text-caption)' }}>
                Light mode ships later — the app is dark for now.
              </span>
            </span>
            <input
              id="settings-dark-mode"
              type="checkbox"
              checked={darkMode}
              onChange={(e) => {
                setDarkMode(e.target.checked);
                if (prefsStatus.kind !== 'idle') setPrefsStatus({ kind: 'idle' });
              }}
              disabled={!prefsLoaded || prefsStatus.kind === 'saving'}
              style={{
                width: '20px',
                height: '20px',
                accentColor: 'var(--color-accent)',
                cursor: 'pointer',
              }}
            />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label htmlFor="settings-calorie-target" style={FIELD_LABEL_STYLE}>
              Daily calorie target
            </label>
            <input
              id="settings-calorie-target"
              type="number"
              inputMode="numeric"
              min={500}
              max={10000}
              step={50}
              value={calorieTarget}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value, 10);
                setCalorieTarget(Number.isFinite(next) ? next : 0);
                if (prefsStatus.kind !== 'idle') setPrefsStatus({ kind: 'idle' });
              }}
              disabled={!prefsLoaded || prefsStatus.kind === 'saving'}
              style={INPUT_STYLE}
            />
            <p style={{ ...STATUS_MSG_STYLE, fontSize: 'var(--text-caption)' }}>
              Used by the calorie-lite mini-app.
            </p>
          </div>

          <button
            type="submit"
            disabled={!prefsLoaded || prefsStatus.kind === 'saving'}
            style={{
              ...PRIMARY_BTN_STYLE,
              opacity: !prefsLoaded || prefsStatus.kind === 'saving' ? 0.6 : 1,
              cursor:
                !prefsLoaded || prefsStatus.kind === 'saving' ? 'not-allowed' : 'pointer',
            }}
          >
            {prefsStatus.kind === 'saving' ? 'Saving…' : 'Save preferences'}
          </button>

          {prefsStatus.kind === 'saved' ? (
            <p role="status" style={STATUS_MSG_STYLE}>
              Saved.
            </p>
          ) : null}
          {prefsStatus.kind === 'error' ? (
            <p role="alert" style={{ ...STATUS_MSG_STYLE, color: 'var(--color-accent)' }}>
              Couldn&apos;t save — {prefsStatus.message}
            </p>
          ) : null}
        </form>
      </section>

      {/* ── Subscription ── */}
      <section aria-labelledby="section-subscription" style={CARD_STYLE}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <p style={KICKER_STYLE}>Section 03</p>
          <h2 id="section-subscription" style={SECTION_HEADING_STYLE}>
            Subscription
          </h2>
        </div>

        {entitlementLoading ? (
          <p style={STATUS_MSG_STYLE}>Checking your subscription…</p>
        ) : isEntitled ? (
          <>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body)',
                color: 'var(--color-text-primary)',
              }}
            >
              <span style={{ color: 'var(--color-text-display)' }}>Nothing Superapp</span>{' '}
              <span
                style={{ fontFamily: 'var(--font-label)', color: 'var(--color-text-secondary)' }}
              >
                — $1/mo · renews on{' '}
              </span>
              <span
                className="data"
                style={{ color: 'var(--color-text-display)' }}
              >
                {formatPeriodEnd(subscription?.current_period_end)}
              </span>
            </p>
            <button
              type="button"
              onClick={openPortal}
              disabled={portalLoading}
              style={{
                ...SECONDARY_BTN_STYLE,
                opacity: portalLoading ? 0.6 : 1,
                cursor: portalLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {portalLoading ? 'Opening…' : 'Manage subscription'}
            </button>
            {portalError ? (
              <p role="alert" style={{ ...STATUS_MSG_STYLE, color: 'var(--color-accent)' }}>
                Couldn&apos;t open portal — {portalError}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body)',
                color: 'var(--color-text-primary)',
              }}
            >
              Not subscribed.
            </p>
            <a
              href="/paywall"
              style={{
                ...PRIMARY_BTN_STYLE,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              Subscribe — $1/mo
            </a>
          </>
        )}
      </section>

      {/* ── Sign out ── */}
      <section aria-labelledby="section-signout" style={CARD_STYLE}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <p style={KICKER_STYLE}>Section 04</p>
          <h2 id="section-signout" style={SECTION_HEADING_STYLE}>
            Sign out
          </h2>
        </div>
        <p style={STATUS_MSG_STYLE}>Ends this session on this device.</p>
        <form action="/auth/signout" method="post">
          <button type="submit" style={DESTRUCTIVE_BTN_STYLE}>
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
