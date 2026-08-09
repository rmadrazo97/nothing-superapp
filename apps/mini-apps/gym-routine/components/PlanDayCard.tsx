'use client';

/**
 * PlanDayCard — one collapsible card per day in a v2 plan.
 *
 * Header shows day number + name + focus chips + exercise count.
 * Collapsed by default when there are more than 2 days so a 5-day plan
 * doesn't monopolise the screen on first view; the first day auto-expands
 * so the user sees SOMETHING structured.
 */
import { useState } from 'react';
import type { PlanDay } from '@nothing/shared';
import { cardStyle, chipStyle } from '../lib/ui.ts';
import { PlanExerciseRow } from './PlanExerciseRow.tsx';

export interface PlanDayCardProps {
  day: PlanDay;
  defaultOpen?: boolean;
  onStartDay?: (day: PlanDay) => void;
}

export function PlanDayCard({ day, defaultOpen = false, onStartDay }: PlanDayCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const dayName = day.name_en ?? day.name_es ?? `Day ${day.day}`;

  return (
    <section
      aria-label={dayName}
      style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          color: 'inherit',
        }}
        aria-expanded={open}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
          <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
            DAY {String(day.day).padStart(2, '0')}
          </span>
          <span className="caption" style={{ color: 'var(--color-text-disabled)' }}>
            {open ? '▾' : '▸'} {day.exercises.length} exercises
          </span>
        </div>
        <span style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-subheading)' }}>
          {dayName}
        </span>
        {day.focus.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {day.focus.map((f) => (
              <span key={f} style={chipStyle(false)}>{f}</span>
            ))}
          </div>
        )}
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {day.exercises.map((ex) => (
            <PlanExerciseRow key={ex.id} exercise={ex} />
          ))}
          {onStartDay && (
            <div style={{ paddingTop: 'var(--space-3)' }}>
              <button
                type="button"
                onClick={() => onStartDay(day)}
                style={{
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
                }}
              >
                Start day {day.day}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
