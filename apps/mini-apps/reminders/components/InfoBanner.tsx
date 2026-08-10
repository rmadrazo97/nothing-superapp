'use client';

/**
 * InfoBanner — dashed-outline "TWO KINDS · ONE LIST" explainer.
 *
 * Renders once at the top of the reminders view to teach the two-in-one
 * shape (Reminders vs Tasks) to first-time users. Dismisses via the ×
 * button; state persists per-user through `useMiniAppSettings('reminders',
 * { infoBannerDismissed: false })`. Returns null until the settings row
 * has loaded so we don't flash the banner for someone who's already
 * dismissed it.
 */
import { useMiniAppSettings } from '../../../web/src/components/mini-app-settings';

interface RemindersSettings {
  infoBannerDismissed: boolean;
  [key: string]: unknown;
}

const DEFAULTS: RemindersSettings = {
  infoBannerDismissed: false,
};

export default function InfoBanner() {
  const { settings, updateSettings, isLoading } =
    useMiniAppSettings<RemindersSettings>('reminders', DEFAULTS);

  // Don't render while the initial GET is in flight — otherwise the banner
  // pops in for one tick before disappearing for users who dismissed it.
  if (isLoading) return null;
  if (settings.infoBannerDismissed) return null;

  return (
    <aside
      aria-label="Reminders and Tasks — how they differ"
      style={{
        position: 'relative',
        border: '1px dashed var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        color: 'var(--color-text-primary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-3)',
        }}
      >
        <span
          className="label"
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          TWO KINDS · ONE LIST
        </span>
        <button
          type="button"
          aria-label="Dismiss info"
          onClick={() => updateSettings({ infoBannerDismissed: true })}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--color-text-secondary)',
            fontSize: 18,
            lineHeight: 1,
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font-label)',
          }}
        >
          ×
        </button>
      </div>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-text-primary)',
          lineHeight: 1.4,
        }}
      >
        <strong style={{ color: 'var(--color-text-display)', fontWeight: 500 }}>
          Reminders
        </strong>{' '}
        ping you at a time.{' '}
        <strong style={{ color: 'var(--color-accent)', fontWeight: 500 }}>
          Tasks
        </strong>{' '}
        fire the assistant on a schedule to do work — a weekly meal-plan
        review, a grocery list from your plan, a gym-adherence check — and
        push you the result.
      </p>
    </aside>
  );
}
