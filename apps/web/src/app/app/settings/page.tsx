'use client';

/**
 * Settings surface.
 *
 * Five sections stacked in a single dot-grid card column:
 *   1. Profile      — email (read-only) + display_name (editable)
 *   2. Preferences  — dark_mode toggle + notifications toggle. Nutrition
 *                     goals + body profile + unit prefs moved to the
 *                     calorie-lite mini-app's own ⚙ settings sheet.
 *   3. Subscription — reads useEntitlement(); shows manage vs subscribe path
 *   4. Sign out     — plain <form> POST to /auth/signout (no JS needed)
 *   5. About        — version + release date + collapsible changelog
 *
 * All colour + spacing values come from design-system CSS custom properties
 * (see design-system/styles.css). No hex codes in this file. Visual language
 * matches /login (dark card on the dot-grid, --color-border-visible frame).
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useEntitlement } from '@/lib/hooks/use-entitlement';
import { useToast } from '@/lib/toast/context';
import { PushSettingsSection } from '@/components/push/PushSettingsSection';
import type { PushTopic } from '@nothing/shared';
import {
  APP_VERSION,
  APP_RELEASE_DATE,
  CHANGELOG,
  formatReleaseDate,
} from '@/lib/version';

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

/**
 * Profile fetch state. Replaces the old boolean `profileLoaded` so a silent
 * fetch failure (e.g. the `profiles.timezone` outage on 2026-08-10) surfaces
 * as an inline error card rather than an empty form the user can't diagnose.
 */
type ProfileLoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
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

/**
 * Grab the browser IANA zone once. Intl is available in every modern engine
 * including iOS Safari + the PWA runtime. Returns null on the rare env
 * without Intl so the field still renders a usable text input.
 */
function detectBrowserTimezone(): string | null {
  if (typeof Intl === 'undefined') return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  // Profile state
  const [email, setEmail] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('');
  const [profileLoad, setProfileLoad] = useState<ProfileLoadState>({ kind: 'loading' });
  const [profileStatus, setProfileStatus] = useState<SaveStatus>({ kind: 'idle' });
  const profileLoaded = profileLoad.kind === 'ready';

  // Preferences state — nutrition + body-profile fields moved to the
  // calorie-lite ⚙ sheet. What lives here is the truly-global stuff:
  // display theme + notification toggle.
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefsStatus, setPrefsStatus] = useState<SaveStatus>({ kind: 'idle' });
  // Push (Web Push) — persisted alongside preferences. We render the sub-
  // surface only after we've read the initial state so the toggle doesn't
  // flash from OFF → ON on first paint.
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [pushTopics, setPushTopics] = useState<PushTopic[]>(['releases']);

  // Subscription — hook lands via task 08
  const { entitlement, subscription, isLoading: entitlementLoading } = useEntitlement();
  const isEntitled = entitlement === 'active' || entitlement === 'trialing';

  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const { toast } = useToast();

  // ── initial loads ──
  // Extracted so the RELOAD button in the error card can re-invoke it.
  // Note: this runs without a cancellation token when called from the button
  // (the reload path is user-initiated and short-lived). The mount-time
  // caller wraps it with a `cancelled` flag to avoid post-unmount setState.
  const loadProfile = useCallback(async (isCancelled?: () => boolean) => {
    setProfileLoad({ kind: 'loading' });
    try {
      const res = await fetch('/api/profile', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`${res.status}_${res.statusText || 'fetch_failed'}`);
      const body = (await res.json()) as {
        profile: { display_name: string | null; timezone: string | null } | null;
        email: string | null;
      };
      if (isCancelled?.()) return;
      setEmail(body.email ?? '');
      setDisplayName(body.profile?.display_name ?? '');
      // Timezone: prefer the persisted value; fall back to the browser's
      // IANA zone so a first-time visitor sees the correct guess and can
      // save it verbatim. Empty string means "unknown → detect on save".
      const persistedTz = body.profile?.timezone ?? null;
      setTimezone(persistedTz ?? detectBrowserTimezone() ?? '');
      setProfileLoad({ kind: 'ready' });
    } catch (err) {
      if (isCancelled?.()) return;
      const message =
        err instanceof TypeError
          ? 'network unreachable'
          : err instanceof Error
            ? err.message
            : 'unknown_error';
      setProfileLoad({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadProfile(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

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
            notifications_enabled?: boolean | null;
            push_enabled?: boolean | null;
            push_topics?: PushTopic[] | null;
          } | null;
        };
        if (cancelled) return;
        if (body.preferences) {
          setDarkMode(body.preferences.theme !== 'light');
          if (typeof body.preferences.notifications_enabled === 'boolean') {
            setNotificationsEnabled(body.preferences.notifications_enabled);
          }
          if (typeof body.preferences.push_enabled === 'boolean') {
            setPushEnabled(body.preferences.push_enabled);
          }
          if (Array.isArray(body.preferences.push_topics)) {
            setPushTopics(body.preferences.push_topics);
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
            // Only send timezone if the user has one (persisted OR browser-
            // detected). An empty string means "leave what's already stored".
            ...(timezone.trim().length > 0 ? { timezone: timezone.trim() } : {}),
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
    [displayName, timezone, toast],
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
            notifications_enabled: notificationsEnabled,
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
    [darkMode, notificationsEnabled, toast],
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

        {profileLoad.kind === 'error' ? (
          // Inline error card — REPLACES the form (not overlaid) so the user
          // isn't tricked into typing into a form that never had server data
          // to reconcile against. RELOAD re-runs the fetch in place.
          <div
            role="alert"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              border: '1px solid var(--color-warning, var(--color-accent))',
              borderRadius: 'var(--radius-compact)',
              background: 'rgba(0, 0, 0, 0.35)',
            }}
          >
            <p
              style={{
                ...KICKER_STYLE,
                color: 'var(--color-warning, var(--color-accent))',
              }}
            >
              PROFILE · LOAD FAILED
            </p>
            <p style={STATUS_MSG_STYLE}>
              Couldn&apos;t load your profile: {profileLoad.message}. This usually means
              a backend hiccup — try again?
            </p>
            <button
              type="button"
              onClick={() => {
                void loadProfile();
              }}
              style={SECONDARY_BTN_STYLE}
            >
              RELOAD
            </button>
          </div>
        ) : (
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

          {/* Timezone (task #105). Pre-filled from the browser IANA zone on
              first visit; persisted to profiles.timezone; read by the copilot
              route so "remind me in 10 min" fires on the user's local wall
              clock, not UTC. Plain text input — dropdowns of every IANA zone
              (300+) don't earn their weight for a value users change once. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label htmlFor="settings-timezone" style={FIELD_LABEL_STYLE}>
              Timezone
            </label>
            <input
              id="settings-timezone"
              type="text"
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value);
                if (profileStatus.kind !== 'idle') setProfileStatus({ kind: 'idle' });
              }}
              disabled={!profileLoaded || profileStatus.kind === 'saving'}
              maxLength={64}
              placeholder="America/Mexico_City"
              aria-describedby="settings-timezone-hint"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              style={INPUT_STYLE}
            />
            <p id="settings-timezone-hint" style={{ ...STATUS_MSG_STYLE, fontSize: 'var(--text-caption)' }}>
              IANA zone. The assistant uses this to schedule reminders in your local time.
            </p>
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
        )}
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

          <label
            htmlFor="settings-notifications"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span style={FIELD_LABEL_STYLE}>Notifications</span>
              <span style={{ ...STATUS_MSG_STYLE, fontSize: 'var(--text-caption)' }}>
                Occasional product updates + streak reminders.
              </span>
            </span>
            <input
              id="settings-notifications"
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => {
                setNotificationsEnabled(e.target.checked);
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

          {/* Web Push sub-surface — appears below the plain notifications
              toggle. Only render once prefs have loaded so the initial
              state matches the server (avoids a false "OFF" flash). */}
          {prefsLoaded ? (
            <div
              style={{
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--color-border)',
              }}
            >
              <PushSettingsSection
                initialEnabled={pushEnabled}
                initialTopics={pushTopics}
              />
            </div>
          ) : null}

          {/*
            Discoverability breadcrumb — nutrition goals + body profile +
            unit prefs are owned by the calorie-lite mini-app's own settings
            sheet now. Kept in Space Mono muted so it reads as a helper,
            not a section header.
          */}
          <p
            className="data"
            style={{
              ...STATUS_MSG_STYLE,
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
              color: 'var(--color-text-disabled)',
            }}
          >
            Nutrition goals moved to Calorie Lite → ⚙ settings.
          </p>

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

      {/* ── About ── */}
      <AboutCard />
    </div>
  );
}

// ─── About card ───────────────────────────────────────────────────────────

/**
 * Version + release-date line on top, native `<details>` disclosure below
 * for the changelog. Native disclosure keeps this zero-JS, keyboard
 * accessible, and print-friendly. All data comes from `lib/version.ts` —
 * this component is a pure renderer.
 */
function AboutCard() {
  return (
    <section
      aria-labelledby="section-about"
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        marginTop: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <p style={KICKER_STYLE}>Section 05</p>
        <h2 id="section-about" style={SECTION_HEADING_STYLE}>
          About
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <span
          className="data"
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-body-sm)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-display)',
          }}
        >
          NOTHING SUPERAPP · v{APP_VERSION}
        </span>
        <span
          className="data"
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          RELEASED {formatReleaseDate(APP_RELEASE_DATE).toUpperCase()}
        </span>
      </div>

      {/* v0.5.3 (task #99): two-step progressive disclosure — the first
          expand shows ONLY the latest release, then a secondary
          `▶ SHOW OLDER (N RELEASES)` reveals the rest inside a bounded
          scroll box. Prior behaviour dumped all 8 releases on one tap,
          which shoved every section below off the viewport. */}
      <details
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            listStyle: 'none',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
            padding: 'var(--space-2) 0',
            userSelect: 'none',
          }}
        >
          ▶ Changelog ({CHANGELOG.length}{' '}
          {CHANGELOG.length === 1 ? 'release' : 'releases'})
        </summary>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--color-border)',
            // Bounded scroll — long changelogs stay tidy, and the box
            // catches the scroll so the page doesn't jump underneath.
            maxHeight: 'clamp(240px, 40dvh, 480px)',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          {CHANGELOG.length > 0 && (
            <ChangelogEntry entry={CHANGELOG[0]} />
          )}

          {CHANGELOG.length > 1 && (
            <details
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  listStyle: 'none',
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-caption)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary)',
                  padding: 'var(--space-2) 0',
                  userSelect: 'none',
                }}
              >
                ▶ Show older ({CHANGELOG.length - 1}{' '}
                {CHANGELOG.length - 1 === 1 ? 'release' : 'releases'})
              </summary>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-4)',
                  paddingTop: 'var(--space-2)',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                {CHANGELOG.slice(1).map((entry) => (
                  <ChangelogEntry key={entry.version} entry={entry} />
                ))}
              </div>
            </details>
          )}
        </div>
      </details>
    </section>
  );
}

/**
 * ChangelogEntry — single-release renderer, factored out of AboutCard so
 * the latest-release + older-releases branches can share one presentation.
 */
function ChangelogEntry({
  entry,
}: {
  entry: (typeof CHANGELOG)[number];
}) {
  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-body-sm)',
          letterSpacing: '0.06em',
          color: 'var(--color-text-display)',
        }}
      >
        v{entry.version}{' '}
        <span style={{ color: 'var(--color-text-secondary)' }}>
          · {formatReleaseDate(entry.date)}
        </span>
      </h3>
      <ul
        style={{
          margin: 0,
          paddingLeft: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body-sm)',
        }}
      >
        {entry.highlights.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </article>
  );
}
