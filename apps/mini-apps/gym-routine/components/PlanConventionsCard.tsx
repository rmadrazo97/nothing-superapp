'use client';

/**
 * PlanConventionsCard — collapsible "NOTATION & RULES" card.
 *
 * Coach-authored plans lean heavily on shorthand ('1 + 3', '6-8 / 8-10',
 * 'RIR 1-2'). Rather than translate it into English inline everywhere, we
 * surface the coach's own definitions once, up-front, in an expandable
 * card so the user can reference them when a term is unfamiliar.
 *
 * Keys are rendered as small labels above their prose so the card scans
 * like a legend, not a paragraph.
 */
import { useState } from 'react';
import type { PlanConventions } from '@nothing/shared';
import { cardStyle } from '../lib/ui.ts';

const HUMAN: Record<string, string> = {
  sets_notation: 'Sets notation',
  reps_notation: 'Reps notation',
  rir_notation: 'RIR notation',
  top_set_rule: 'Top set rule',
  rir_definition: 'RIR definition',
  coach_note: 'Coach note',
};

export function PlanConventionsCard({ conventions }: { conventions: PlanConventions }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(conventions);
  if (entries.length === 0) return null;

  return (
    <section
      style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
          color: 'inherit',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
        }}
      >
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          {open ? '▾' : '▸'} NOTATION & RULES
        </span>
        <span className="caption" style={{ color: 'var(--color-text-disabled)' }}>
          {entries.length} note{entries.length === 1 ? '' : 's'}
        </span>
      </button>

      {open && (
        <dl style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <dt
                className="label"
                style={{
                  fontFamily: 'var(--font-label)',
                  color: 'var(--color-text-secondary)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {HUMAN[k] ?? k.replace(/_/g, ' ')}
              </dt>
              <dd
                style={{
                  margin: 0,
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--text-caption)',
                  lineHeight: 1.5,
                }}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
