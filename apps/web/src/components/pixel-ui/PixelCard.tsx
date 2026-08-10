'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * PixelCard — shared container for every pixel-ui component.
 *
 * Nothing OS surface: near-black substrate (`--color-surface`), hairline
 * border, small radius (`--radius-compact`), `--space-4` interior. The
 * top-right corner carries a 2×2 cadmium pixel cluster — the "instrument
 * LED lit" signature that ties the whole render_* family together (see
 * design/pixel-ui-v0.5.4.md for the reasoning).
 *
 * Optional `title` renders as an eyebrow in Space Mono uppercase; children
 * sit beneath it with their own layout. Zero animation — the reading is
 * the point, not the motion.
 */

export interface PixelCardProps {
  /** Uppercase Space Mono eyebrow — omit if the child renders its own. */
  title?: string;
  /** Optional right-aligned hint next to the title (e.g. "KG · LAST 7D"). */
  meta?: string;
  children: ReactNode;
  /** Escape hatch — prefer letting the card own its footprint. */
  style?: CSSProperties;
}

export function PixelCard({ title, meta, children, style }: PixelCardProps) {
  return (
    <div
      className="nsa-pixel-card"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-compact)',
        background: 'var(--color-surface)',
        color: 'var(--color-text-primary)',
        // Give the LED cluster room in the top-right without overlapping
        // long titles.
        paddingRight: 'calc(var(--space-4) + 16px)',
        ...style,
      }}
    >
      {/* 2×2 cadmium LED cluster — the family signature. Purely decorative,
          aria-hidden so screen readers skip it. Absolute-positioned so it
          survives any child layout. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 'var(--space-3)',
          right: 'var(--space-3)',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 4px)',
          gridAutoRows: '4px',
          gap: '1px',
        }}
      >
        <span style={{ width: 4, height: 4, background: 'var(--color-accent)' }} />
        <span style={{ width: 4, height: 4, background: 'var(--color-accent)' }} />
        <span style={{ width: 4, height: 4, background: 'var(--color-accent)' }} />
        <span style={{ width: 4, height: 4, background: 'var(--color-accent)' }} />
      </span>

      {(title || meta) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          {title && (
            <span
              style={{
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
              }}
            >
              {title}
            </span>
          )}
          {meta && (
            <span
              style={{
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-caption)',
                letterSpacing: '0.06em',
                color: 'var(--color-text-disabled)',
              }}
            >
              {meta}
            </span>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
