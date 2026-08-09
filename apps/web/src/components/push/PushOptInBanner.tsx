'use client';

/**
 * PushOptInBanner
 *
 * Bottom-anchored dark card that nudges the user to turn on Web Push. Fires
 * only when:
 *   - The device supports push (SW + PushManager + Notification API).
 *   - Notification.permission is currently 'default' (never re-prompt if
 *     the user already accepted or blocked — that would be noisy and, on
 *     Chrome, actually blocks the site from asking again).
 *   - Preferences say push_enabled === false (i.e. we don't already have a
 *     saved subscription for this account on another device).
 *   - The user has been on the app for > 30s (defer the ask past the
 *     first-run rush).
 *   - `sessionStorage['nothing:push-snooze']` isn't set (24h snooze after
 *     "NOT NOW").
 *
 * Design-system tokens only, no hex. Uses --space-4 / --space-6 (space
 * scale skips 5 + 7).
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { usePreferences } from '@nothing/mini-apps-runtime';
import { useToast } from '@/lib/toast/context';
import { currentPermission, enablePush, isPushSupported } from './push-client';

const SNOOZE_KEY = 'nothing:push-snooze';
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const DEFER_MS = 30_000;

function isSnoozed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

const CARD_STYLE: CSSProperties = {
  position: 'fixed',
  left: 'var(--space-4)',
  right: 'var(--space-4)',
  bottom: 'var(--space-6)',
  zIndex: 40,
  maxWidth: '520px',
  marginInline: 'auto',
  background: 'rgba(0, 0, 0, 0.9)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
};

const KICKER_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-display)',
};

const BODY_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body-sm)',
  color: 'var(--color-text-secondary)',
};

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  justifyContent: 'flex-end',
};

const PRIMARY_BTN_STYLE: CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  border: 'none',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: '40px',
};

const GHOST_BTN_STYLE: CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: '40px',
};

export function PushOptInBanner() {
  const preferences = usePreferences();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    if (preferences.push_enabled) return;
    if (isSnoozed()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      const perm = await currentPermission();
      if (cancelled) return;
      if (perm !== 'default') return; // 'granted' → already on; 'denied' → don't re-prompt
      // Defer the ask past the first-run rush.
      timer = setTimeout(() => {
        if (!cancelled) setVisible(true);
      }, DEFER_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [preferences.push_enabled]);

  const onEnable = useCallback(async () => {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      toast.success('Notifications on. We will keep it rare and useful.');
      setVisible(false);
    } else if (result.reason === 'denied') {
      toast.error('Permission blocked. Turn it back on in your browser settings.');
      setVisible(false);
    } else if (result.reason === 'unsupported') {
      toast.error('This browser does not support push notifications.');
      setVisible(false);
    } else {
      toast.error(`Could not enable notifications — ${result.message ?? 'try again'}`);
    }
  }, [toast]);

  const onSnooze = useCallback(() => {
    try {
      window.sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* noop */
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div role="dialog" aria-labelledby="push-optin-title" style={CARD_STYLE}>
      <p id="push-optin-title" style={KICKER_STYLE}>
        ◐ Turn on notifications
      </p>
      <p style={BODY_STYLE}>
        Get release notes when the app ships something new. We will not spam.
      </p>
      <div style={ROW_STYLE}>
        <button
          type="button"
          onClick={onSnooze}
          disabled={busy}
          style={{ ...GHOST_BTN_STYLE, opacity: busy ? 0.6 : 1 }}
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onEnable}
          disabled={busy}
          style={{ ...PRIMARY_BTN_STYLE, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Enabling…' : 'Enable'}
        </button>
      </div>
    </div>
  );
}
