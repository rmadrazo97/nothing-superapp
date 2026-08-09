'use client';

/**
 * PlanExerciseRow — one exercise entry inside a v2 plan day.
 *
 * Three renderable shapes, keyed by the discriminated `structure`:
 *   - straight        → single "STRAIGHT · N × Xr · RIR" line
 *   - top_set_backoff → "TOP SET · 1 × 6-8 · RIR 1-2" + "BACKOFF · 3 × 8-10 · RIR 2"
 *   - superset        → "SUPERSET · N ROUNDS" header + two indented component rows
 *
 * Extras rendered when present: alternatives ("or: Hack squat / Pendulum squat"),
 * unilateral badge ("PER SIDE"), and the coach's raw notation as a monospace
 * tooltip-like caption ("coach: 1 + 3 · 6-8 / 8-10").
 *
 * Design tokens only — no hex. Density mirrors the rest of the mini-app
 * (space-3/4 for card interior, Space Mono for numerics).
 */
import type { PlanExercise, RepRange, RestRange, RirRange } from '@nothing/shared';

function fmtRange(r: { min: number; max: number }): string {
  return r.min === r.max ? `${r.min}` : `${r.min}-${r.max}`;
}

function fmtRest(r: RestRange): string {
  if (r.min === r.max) return `${r.min}s`;
  return `${r.min}-${r.max}s`;
}

function fmtReps(r: RepRange, perSide: boolean): string {
  const base = fmtRange(r);
  return perSide ? `${base}/side` : base;
}

function fmtRir(r?: RirRange): string | null {
  if (!r) return null;
  return `RIR ${fmtRange(r)}`;
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  gap: 'var(--space-3)',
  alignItems: 'baseline',
  fontFamily: 'var(--font-mono, "Space Mono", monospace)',
  fontSize: 'var(--text-caption)',
  letterSpacing: '0.04em',
  color: 'var(--color-text-primary)',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px var(--space-2)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-compact)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
  whiteSpace: 'nowrap',
};

export function PlanExerciseRow({ exercise }: { exercise: PlanExercise }) {
  const displayName = exercise.name_en ?? exercise.name_es ?? '(unnamed)';
  const perSide = exercise.reps_per_side === true;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        paddingTop: 'var(--space-3)',
        paddingBottom: 'var(--space-3)',
        borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
      }}
    >
      {/* Header: name + badges */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-body)' }}>
          {String(exercise.order).padStart(2, '0')} · {displayName}
        </span>
        {exercise.equipment && (
          <span style={badgeStyle}>{exercise.equipment}</span>
        )}
        {exercise.unilateral && (
          <span style={badgeStyle}>per side</span>
        )}
      </div>

      {/* Secondary name (name_es when English is primary and different) */}
      {exercise.name_en && exercise.name_es && exercise.name_en !== exercise.name_es && (
        <span
          className="caption"
          style={{ color: 'var(--color-text-disabled)', fontStyle: 'italic' }}
        >
          {exercise.name_es}
        </span>
      )}

      {/* Blocks / components */}
      {exercise.structure === 'superset' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{ ...labelStyle, color: 'var(--color-accent)' }}>
            SUPERSET · {exercise.rounds} ROUND{exercise.rounds === 1 ? '' : 'S'}
          </span>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {exercise.components.map((c) => {
              const rir = fmtRir(c.rir);
              return (
                <li key={c.order} style={rowStyle}>
                  <span style={labelStyle}>{String(c.order)}</span>
                  <span>{c.name_en ?? c.name_es ?? '(component)'}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {c.sets}×{fmtReps(c.reps, false)}
                    {rir ? ` · ${rir}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
          {exercise.rest_note && (
            <span className="caption" style={{ color: 'var(--color-text-disabled)' }}>
              {exercise.rest_note}
            </span>
          )}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {exercise.blocks.map((b, i) => {
            const rir = fmtRir(b.rir);
            const roleLabel =
              b.role === 'top_set' ? 'TOP SET'
                : b.role === 'backoff' ? 'BACKOFF'
                  : 'STRAIGHT';
            return (
              <li key={i} style={rowStyle}>
                <span
                  style={{
                    ...labelStyle,
                    color:
                      b.role === 'top_set'
                        ? 'var(--color-accent)'
                        : 'var(--color-text-secondary)',
                  }}
                >
                  {roleLabel}
                </span>
                <span>
                  {b.sets}×{fmtReps(b.reps, perSide)}
                </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {rir ?? ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Rest + alternatives + raw notation */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
          color: 'var(--color-text-secondary)',
          fontFamily: 'var(--font-mono, "Space Mono", monospace)',
          fontSize: 'var(--text-caption)',
        }}
      >
        <span>REST {fmtRest(exercise.rest_seconds)}</span>
        {exercise.alternatives && exercise.alternatives.length > 0 && (
          <span style={{ color: 'var(--color-text-disabled)' }}>
            or: {exercise.alternatives.join(' / ')}
          </span>
        )}
      </div>

      {exercise.raw && Object.keys(exercise.raw).length > 0 && (
        <span
          className="caption"
          style={{
            color: 'var(--color-text-disabled)',
            fontFamily: 'var(--font-mono, "Space Mono", monospace)',
          }}
        >
          coach: {Object.entries(exercise.raw).map(([k, v]) => `${k}=${v}`).join(' · ')}
        </span>
      )}
    </div>
  );
}
