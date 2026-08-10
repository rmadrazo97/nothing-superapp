'use client';

/**
 * SettingsSection — one numbered card in a mini-app settings panel.
 *
 * Renders the two-line eyebrow ("Section 01" over the title) that matches
 * the visual language of the global Settings surface + a stack of children
 * inside a dark, dot-grid-tier card.
 */
import type { ReactNode } from 'react';
import {
  SECTION_CARD_STYLE,
  SECTION_KICKER_STYLE,
  SECTION_TITLE_STYLE,
  sectionEyebrow,
} from './tokens';

export type SettingsSectionProps = {
  /** 1-indexed section number. Rendered as "Section 01", "Section 02", ... */
  number: number;
  /** Human-readable section title. */
  title: string;
  /** Optional descriptive line under the title. */
  description?: string;
  children: ReactNode;
};

export function SettingsSection({
  number,
  title,
  description,
  children,
}: SettingsSectionProps) {
  const headingId = `mini-app-settings-section-${number}`;
  return (
    <section aria-labelledby={headingId} style={SECTION_CARD_STYLE}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <p style={SECTION_KICKER_STYLE}>{sectionEyebrow(number)}</p>
        <h2 id={headingId} style={SECTION_TITLE_STYLE}>
          {title}
        </h2>
        {description ? (
          <p
            style={{
              margin: 0,
              marginTop: 'var(--space-2)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
            }}
          >
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
