'use client';

/**
 * LoadErrorCard — shared "couldn't load, try again" surface for mini-apps.
 *
 * v0.5.5 / v0.5.6 silent-catch sweep taught us: rendering an empty list on
 * a fetch failure is indistinguishable from "you have no data yet". Every
 * data surface needs to say "the request failed" AND give the user a
 * one-tap way to retry. This is that surface.
 *
 * Visual anatomy (mirrors the settings/page.tsx v0.5.5 pattern):
 *   - Uppercase Space Mono kicker rendered as `<SECTION> · LOAD FAILED`,
 *     tinted with `--color-warning` (falls back to `--color-accent`).
 *   - One-line body — "Couldn't load your <thing>: <error>. …try again?".
 *   - Ghost RELOAD button, self-aligned left, calls `onReload`.
 *
 * Props are intentionally minimal:
 *   - `section` names the surface ("MEASUREMENTS", "REMINDERS", "PROFILE").
 *   - `message` carries the raw error message from the failed fetch.
 *   - `onReload` re-runs the fetch.
 *   - `thingLabel` overrides the "your <section>" phrasing when the
 *     grammatical shape differs (e.g. "your meal plans" vs
 *     `${section.toLowerCase()}` producing "your plans").
 *
 * All tokens are `var(--*)` — no hex, no magic px. The kicker + button
 * styles mirror the settings SECONDARY_BTN_STYLE so profile/settings
 * failures and mini-app failures look like the same family.
 */
import type { CSSProperties } from 'react';

export type LoadErrorCardProps = {
  /** Section kicker, e.g. "MEASUREMENTS", "REMINDERS". Rendered as `<KICKER> · LOAD FAILED` (auto-uppercased). */
  section: string;
  /** Error message from the failed fetch. Shown after the "Couldn't load …" lead. */
  message: string;
  /** Called when the user taps RELOAD. */
  onReload: () => void;
  /** Optional: override the "your <section>" phrasing (e.g. "your meal plans"). */
  thingLabel?: string;
};

const CARD_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  border: '1px solid var(--color-warning, var(--color-accent))',
  borderRadius: 'var(--radius-card)',
  background: 'rgba(0, 0, 0, 0.35)',
};

const KICKER_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-warning, var(--color-accent))',
};

const BODY_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body-sm)',
  color: 'var(--color-text-primary)',
};

/**
 * Ghost RELOAD button — mirrors the SECONDARY_BTN_STYLE in
 * `apps/web/src/app/app/settings/page.tsx` so the profile-load-failed
 * card and mini-app-load-failed cards share visual weight.
 */
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
  transition:
    'border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
};

export function LoadErrorCard({
  section,
  message,
  onReload,
  thingLabel,
}: LoadErrorCardProps) {
  const label = thingLabel ?? `your ${section.toLowerCase()}`;
  return (
    <div role="alert" style={CARD_STYLE}>
      <p style={KICKER_STYLE}>{section.toUpperCase()} · LOAD FAILED</p>
      <p style={BODY_STYLE}>
        Couldn&apos;t load {label}: {message}. This usually means a backend
        hiccup — try again?
      </p>
      <button type="button" onClick={onReload} style={SECONDARY_BTN_STYLE}>
        RELOAD
      </button>
    </div>
  );
}
