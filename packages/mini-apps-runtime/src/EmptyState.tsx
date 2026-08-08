'use client';

/**
 * EmptyState — shared 0-data affordance for every mini-app.
 *
 * Empty states are the first surface a brand-new user sees inside a mini-app.
 * They MUST tell the user two things:
 *   1. Why the surface is blank (a "reason" — uppercase Space Mono label).
 *   2. What to do next (a body line + an unmissable primary CTA).
 *
 * Visual anatomy (Nothing OS "instrument panel" language):
 *   - Dashed 1px `--color-border-visible` outline on a transparent background.
 *   - Big Doto glyph at the top (the mini-app's own icon — pass as `icon`).
 *   - Uppercase Space Mono title (the reason).
 *   - Short Space Grotesk body (what to do).
 *   - Optional primary CTA + optional secondary CTA below.
 *
 * Design constraints:
 *   - No hex codes; tokens only.
 *   - Padding uses --space-8 vertical, --space-6 horizontal (per skill brief).
 *   - Icon renders in accent red by default; opt out via `iconTone="secondary"`.
 *
 * This component lives in `@nothing/mini-apps-runtime` so both the harness
 * shell (`apps/web/src/...`) and every mini-app under `apps/mini-apps/*`
 * import from the same place. Mini-apps don't reach into the shell's src/.
 */
import type { CSSProperties, ReactNode } from 'react';

export type EmptyStateAction = {
  /** Visible label. Rendered ALL CAPS via `text-transform: uppercase`. */
  label: string;
  /** Click handler. Prefer this when the target is an in-page state change. */
  onClick?: () => void;
  /** Href — rendered as an anchor when set. onClick is ignored. */
  href?: string;
  /** ARIA label override, when the visible label needs more context. */
  ariaLabel?: string;
};

export type EmptyStateProps = {
  /** Glyph rendered at the top — usually the mini-app's own icon character. */
  icon: ReactNode;
  /** Ink color for the icon. Accent red is the default "signal light". */
  iconTone?: 'accent' | 'secondary';
  /** UPPERCASE reason line — "why is this empty". */
  title: string;
  /** Short body line — "what to do next". */
  body: string;
  /** Primary CTA — the button gets accent-red fill; use for the main action. */
  primaryAction?: EmptyStateAction;
  /** Optional secondary CTA — ghost outline. */
  secondaryAction?: EmptyStateAction;
  /** Optional style override — merged onto the outer container. */
  style?: CSSProperties;
};

const containerStyle: CSSProperties = {
  border: '1px dashed var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-8) var(--space-6)',
  background: 'transparent',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  textAlign: 'center',
};

const iconStyle = (tone: 'accent' | 'secondary'): CSSProperties => ({
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 32,
  lineHeight: 1,
  color:
    tone === 'accent'
      ? 'var(--color-accent)'
      : 'var(--color-text-secondary)',
});

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-primary)',
  margin: 0,
};

const bodyStyle: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body-sm)',
  color: 'var(--color-text-secondary)',
  margin: 0,
  maxWidth: '32ch',
  lineHeight: 1.5,
};

const primaryButtonStyle: CSSProperties = {
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  border: 0,
  borderRadius: 'var(--radius-button)',
  padding: 'var(--space-3) var(--space-6)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: 44,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const ghostButtonStyle: CSSProperties = {
  background: 'transparent',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-button)',
  padding: 'var(--space-3) var(--space-6)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: 44,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function ActionButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: 'primary' | 'ghost';
}) {
  const style = variant === 'primary' ? primaryButtonStyle : ghostButtonStyle;
  if (action.href) {
    return (
      <a
        href={action.href}
        aria-label={action.ariaLabel ?? action.label}
        style={style}
      >
        {action.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      aria-label={action.ariaLabel ?? action.label}
      style={style}
    >
      {action.label}
    </button>
  );
}

export function EmptyState({
  icon,
  iconTone = 'accent',
  title,
  body,
  primaryAction,
  secondaryAction,
  style,
}: EmptyStateProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      style={style ? { ...containerStyle, ...style } : containerStyle}
    >
      <div aria-hidden="true" style={iconStyle(iconTone)}>
        {icon}
      </div>
      <p style={titleStyle}>{title}</p>
      <p style={bodyStyle}>{body}</p>
      {(primaryAction || secondaryAction) && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 'var(--space-2)',
          }}
        >
          {primaryAction && (
            <ActionButton action={primaryAction} variant="primary" />
          )}
          {secondaryAction && (
            <ActionButton action={secondaryAction} variant="ghost" />
          )}
        </div>
      )}
    </section>
  );
}
