'use client';

import type { BodyPart } from '@nothing/shared';
import { chipStyle } from '../lib/ui.ts';

// Order matches the DB check constraint — kept manually so the "All" chip
// can be prepended without a runtime sort. If we add a body part upstream,
// this list is the one place to touch.
const BODY_PARTS: BodyPart[] = [
  'chest',
  'back',
  'shoulders',
  'upper arms',
  'lower arms',
  'waist',
  'upper legs',
  'lower legs',
  'cardio',
  'neck',
];

/**
 * BodyPartTabs — horizontal pill row for filtering the exercise grid.
 *
 * `null` = "All" (no filter). Scrolls horizontally on mobile — no snap
 * points because the labels vary in width and snap-align looks worse than
 * free scroll for this kind of taxonomy.
 */
export default function BodyPartTabs({
  value,
  onChange,
}: {
  value: BodyPart | null;
  onChange: (v: BodyPart | null) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Body parts"
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        overflowX: 'auto',
        paddingBottom: 'var(--space-2)',
        // Hide scrollbars but keep functionality.
        scrollbarWidth: 'none',
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === null}
        onClick={() => onChange(null)}
        style={chipStyle(value === null)}
      >
        All
      </button>
      {BODY_PARTS.map((bp) => (
        <button
          key={bp}
          type="button"
          role="tab"
          aria-selected={value === bp}
          onClick={() => onChange(bp)}
          style={chipStyle(value === bp)}
        >
          {bp}
        </button>
      ))}
    </div>
  );
}
