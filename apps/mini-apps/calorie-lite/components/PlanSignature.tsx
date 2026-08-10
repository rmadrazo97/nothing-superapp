'use client';

/**
 * PlanSignature — the tape-ticker + pushpin primitives shared across
 * PLAN list, detail, and form.
 *
 * These are the *signature* elements defined in
 * `services/growth/campaigns/nothing-superapp/design/plan-view-v0.5.3.md`:
 *
 *   - <MacroTape>   a 4-cell segmented tape with Doto numerals inside
 *                   Space-Mono-labeled cells. Reads as instrument output,
 *                   not a stat bar. Used in DETAIL header and inside
 *                   PLAN cards when hero-sized.
 *   - <Pushpin>     a 12px hollow / filled ember-red circle. Filled means
 *                   ACTIVE. Used in the LIST card gutter and on the DETAIL
 *                   title row.
 *   - <AdherenceLED> 6px filled circle in --color-success when the meal was
 *                   logged today, hollow otherwise. Used per-meal on
 *                   the timeline rail.
 *   - <TimelineRail> The left-gutter rail primitive — a wrapper that
 *                   renders meal number in crushed Doto in the left
 *                   gutter, content in the right column, with a bottom
 *                   hairline between siblings.
 *
 * Motion: the tape unfurls on mount (cells slide in from the right with a
 * 60ms stagger); reduced-motion users see the final state instantly.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

// ─── Pushpin ────────────────────────────────────────────────────────────────

export function Pushpin({
  active,
  size = 12,
  ariaLabel,
}: {
  active: boolean;
  size?: number;
  ariaLabel?: string;
}) {
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? (active ? 'Active plan' : 'Inactive plan')}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: active ? 'var(--color-accent)' : 'transparent',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
        flexShrink: 0,
      }}
    />
  );
}

// ─── Adherence LED ──────────────────────────────────────────────────────────

export function AdherenceLED({ lit }: { lit: boolean }) {
  return (
    <span
      role="img"
      aria-label={lit ? 'Logged today' : 'Not yet logged today'}
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: lit ? 'var(--color-success)' : 'transparent',
        border: `1px solid ${lit ? 'var(--color-success)' : 'var(--color-border-visible)'}`,
        flexShrink: 0,
        transition: 'background 120ms cubic-bezier(0.2, 0.7, 0.3, 1), border-color 120ms cubic-bezier(0.2, 0.7, 0.3, 1)',
      }}
    />
  );
}

// ─── Macro tape ─────────────────────────────────────────────────────────────

export interface MacroTapeCell {
  label: string;   // "KCAL" | "P" | "C" | "F"
  value: number;   // integer
  suffix?: string; // "g" — usually omitted; the label carries the unit
}

/**
 * MacroTape — a 4-cell segmented strip. Each cell has a mono label above
 * and a Doto numeral inside. Total width is fluid; cells share the row.
 *
 * Visual grammar:
 *   ┌─────────┬─────────┬─────────┬─────────┐
 *   │  KCAL   │    P    │    C    │    F    │
 *   │  2100   │   109   │   308   │    47   │
 *   └─────────┴─────────┴─────────┴─────────┘
 */
export function MacroTape({
  cells,
  size = 'md',
  animate = true,
}: {
  cells: MacroTapeCell[];
  /** md = detail header (48px Doto), sm = compact list card (28px Doto). */
  size?: 'sm' | 'md';
  /** Unfurl on mount (cascade). Set false when animating parent already. */
  animate?: boolean;
}) {
  const [mounted, setMounted] = useState(!animate);
  useEffect(() => {
    if (animate) {
      const t = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(t);
    }
    return undefined;
  }, [animate]);

  // Value size uses clamp() so the tape stays inside the viewport even at
  // 320px width. At md the target is ~40px on mobile, up to 48px on wider
  // surfaces. Suffix + label are already small and don't need scaling.
  const valueSize = size === 'md'
    ? 'clamp(28px, 9.5vw, 44px)'
    : 'clamp(20px, 6vw, 26px)';
  const labelSize = 'var(--text-label)';
  const cellPad = size === 'md' ? 'var(--space-3) var(--space-1)' : 'var(--space-2) var(--space-1)';

  return (
    <div
      role="group"
      aria-label="Daily targets"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-compact)',
        overflow: 'hidden',
        background: 'var(--color-bg)',
        width: '100%',
      }}
    >
      {cells.map((c, i) => (
        <div
          key={c.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: cellPad,
            minWidth: 0,
            overflow: 'hidden',
            borderLeft: i === 0 ? 0 : '1px solid var(--color-border-visible)',
            transform: mounted ? 'translateX(0)' : 'translateX(12px)',
            opacity: mounted ? 1 : 0,
            transition: `transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1) ${i * 60}ms, opacity 220ms cubic-bezier(0.2, 0.7, 0.3, 1) ${i * 60}ms`,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: labelSize,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              lineHeight: 1,
            }}
          >
            {c.label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: valueSize,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              color: 'var(--color-text-display)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatNumber(c.value)}
            {c.suffix && (
              <span
                style={{
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-text-secondary)',
                  marginLeft: 2,
                }}
              >
                {c.suffix}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return String(Math.round(n));
}

// ─── Timeline rail row ──────────────────────────────────────────────────────

const GUTTER_WIDTH = 56;

export function TimelineRail({
  children,
  first = false,
  last = false,
}: {
  children: ReactNode;
  first?: boolean;
  last?: boolean;
}) {
  // Wrapper around all rail rows so we can round the outer corners and
  // draw a single ambient border.
  return (
    <div
      style={{
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        background: 'var(--color-surface)',
      }}
    >
      {children}
    </div>
  );
}

export function TimelineStation({
  order,
  isLast = false,
  children,
}: {
  order: number;
  isLast?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `${GUTTER_WIDTH}px 1fr`,
        borderBottom: isLast ? 0 : '1px solid var(--color-border)',
        minHeight: 96,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: 'var(--space-4)',
          borderRight: '1px solid var(--color-border)',
          background: 'rgba(0, 0, 0, 0.35)',
        }}
      >
        <span
          aria-hidden
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--text-display-md)',
            lineHeight: 0.85,
            letterSpacing: '-0.02em',
            color: 'var(--color-text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {String(order).padStart(2, '0')}
        </span>
      </div>
      <div
        style={{
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Section rule (hairline separator with a mono label above) ───────────────

export function SectionRule({
  label,
  right,
  style,
}: {
  label: string;
  right?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        paddingBottom: 'var(--space-2)',
        borderBottom: '1px solid var(--color-border-visible)',
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-label)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
        }}
      >
        {label}
      </span>
      {right}
    </div>
  );
}
