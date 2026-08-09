'use client';

/**
 * PlanRulesCard — a collapsible disclosure of a plan's rules block.
 *
 * The rules object is highly variable — a nutritionist may set some, all, or
 * none of: weighing, vegetables, free_meal, hydration, allowed_free_drinks,
 * option_interchangeability, protein_source_swap. We render only the sections
 * that are present so the card stays tight when the plan is spartan.
 */
import { useState } from 'react';
import type { PlanRules } from '@nothing/shared';

export function PlanRulesCard({ rules }: { rules: PlanRules | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!rules) return null;
  const anyRule =
    rules.weighing ||
    rules.vegetables ||
    rules.free_meal ||
    rules.hydration ||
    (rules.allowed_free_drinks && rules.allowed_free_drinks.length > 0) ||
    rules.option_interchangeability ||
    rules.protein_source_swap;
  if (!anyRule) return null;

  return (
    <section
      aria-label="Plan rules"
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--color-text-primary)',
        }}
      >
        <span className="label">RULES</span>
        <span
          className="data"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
          }}
        >
          {open ? '◐ HIDE' : '◐ SHOW'}
        </span>
      </button>

      {open && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {rules.weighing && (
            <RuleRow
              label="WEIGHING"
              value={rules.weighing.state.toUpperCase()}
              note={rules.weighing.note_en ?? rules.weighing.note_es}
            />
          )}
          {rules.hydration && (
            <RuleRow
              label="HYDRATION"
              value={`MIN ${rules.hydration.min_water_litres} L / DAY`}
            />
          )}
          {rules.free_meal && (
            <RuleRow
              label="FREE MEAL"
              value={`${rules.free_meal.per_week} / WEEK`}
              note={rules.free_meal.note_en ?? rules.free_meal.note_es}
            />
          )}
          {rules.vegetables && (
            <RuleRow
              label="VEGETABLES"
              value={`${rules.vegetables.unlimited ? 'UNLIMITED' : 'MEASURED'} · ${rules.vegetables.optional ? 'OPTIONAL' : 'REQUIRED'} · APPLIES ${rules.vegetables.applies_to.map((s) => s.toUpperCase()).join(', ')}`}
              note={
                rules.vegetables.fallback
                  ? `If skipped: ${rules.vegetables.fallback}. ${rules.vegetables.note_en ?? rules.vegetables.note_es ?? ''}`.trim()
                  : rules.vegetables.note_en ?? rules.vegetables.note_es
              }
              accent
            />
          )}
          {rules.allowed_free_drinks && rules.allowed_free_drinks.length > 0 && (
            <RuleRow
              label="FREE DRINKS"
              value={rules.allowed_free_drinks
                .map((d) => d.replace(/_/g, ' ').toUpperCase())
                .join(' · ')}
            />
          )}
          {rules.option_interchangeability && (
            <RuleRow
              label="OPTIONS"
              value={
                rules.option_interchangeability.across_meals
                  ? 'INTERCHANGEABLE ACROSS DAYS'
                  : 'FIXED PER DAY'
              }
              note={rules.option_interchangeability.note_en ?? rules.option_interchangeability.note_es}
            />
          )}
          {rules.protein_source_swap && (
            <RuleRow
              label="PROTEIN SWAP"
              value={
                rules.protein_source_swap.allowed
                  ? `ALLOWED · ${rules.protein_source_swap.scope.toUpperCase().replace(/_/g, ' ')}`
                  : 'NOT ALLOWED'
              }
              note={rules.protein_source_swap.note_en ?? rules.protein_source_swap.note_es}
            />
          )}
        </ul>
      )}
    </section>
  );
}

function RuleRow({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note?: string | null;
  accent?: boolean;
}) {
  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        paddingBottom: 'var(--space-3)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
        }}
      >
        <span
          className="label"
          style={{ color: accent ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
        >
          {label}
        </span>
        <span
          className="data"
          style={{
            color: 'var(--color-text-display)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.04em',
            textAlign: 'right',
          }}
        >
          {value}
        </span>
      </div>
      {note && (
        <span
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
            lineHeight: 1.4,
          }}
        >
          {note}
        </span>
      )}
    </li>
  );
}
