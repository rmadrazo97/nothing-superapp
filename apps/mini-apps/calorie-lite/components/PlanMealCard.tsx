'use client';

/**
 * PlanMealCard — one meal from the plan with its target macros, an option
 * selector, the selected option's ingredient list, and a LOG CTA that fires
 * POST /meal-plans/log-meal.
 *
 * The selected option is stored in local state; when the user LOGs, we send
 * that option to the server which:
 *   1. Inserts one app_calorie_entries row per quantified ingredient
 *   2. Upserts a meal_plan_adherence row for TODAY (user, date, meal_id)
 */
import { useState } from 'react';
import type { PlanMeal, PlanMealOption, Ingredient } from '@nothing/shared';

export interface PlanMealCardProps {
  meal: PlanMeal;
  mealPlanId: string;
  /** 1-based option most recently logged for TODAY (from adherence), or null. */
  adherenceOption: number | null;
  onLogged: (result: {
    inserted: number;
    adherence_id: string;
    option_selected: number;
    meal_slot: string;
  }) => void;
  onError: (message: string) => void;
}

export function PlanMealCard({
  meal,
  mealPlanId,
  adherenceOption,
  onLogged,
  onError,
}: PlanMealCardProps) {
  // Default to previously-logged option, else the first option.
  const [selected, setSelected] = useState<number>(
    adherenceOption ?? meal.options[0]?.option ?? 1,
  );
  const [logging, setLogging] = useState(false);

  const option = meal.options.find((o) => o.option === selected) ?? meal.options[0];

  async function submitLog() {
    if (logging) return;
    setLogging(true);
    try {
      const res = await fetch(
        '/api/mini-apps/calorie-lite/meal-plans/log-meal',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            meal_plan_id: mealPlanId,
            meal_id: meal.id,
            option_selected: selected,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        onError(body?.error === 'no_active_plan'
          ? 'Activate this plan first.'
          : body?.error === 'invalid_body'
            ? 'Log payload invalid.'
            : 'Could not log meal.');
        setLogging(false);
        return;
      }
      const body = (await res.json()) as {
        inserted: number;
        adherence_id: string;
        meal_slot: string;
      };
      onLogged({
        inserted: body.inserted,
        adherence_id: body.adherence_id,
        option_selected: selected,
        meal_slot: body.meal_slot,
      });
    } catch {
      onError('Network error while logging meal.');
    } finally {
      setLogging(false);
    }
  }

  const title = meal.name_en ?? meal.name_es ?? meal.id.toUpperCase();
  const isLoggedToday = adherenceOption === selected;

  // Compact single-line macro summary — replaces the previous verbose
  // "PROTEIN 35G · CARBS 95G · FAT 15G · 650 KCAL" that ate an entire row.
  const targetSummary = `P${Math.round(meal.targets.protein_g)}g · C${Math.round(meal.targets.carbs_g)}g · F${Math.round(meal.targets.fat_g)}g · ${Math.round(meal.targets.calories_kcal)} KCAL`;

  return (
    <section
      aria-label={title}
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
      {/* Header — meal number + name on left, tiny target summary on right.
          Previous version stacked target on its own row which cost vertical
          real estate. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        <span className="label label-strong">
          {String(meal.order).padStart(2, '0')} · {title.toUpperCase()}
        </span>
        <span
          className="data"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.04em',
          }}
        >
          {targetSummary}
        </span>
      </div>

      <OptionChips
        options={meal.options}
        selected={selected}
        onSelect={setSelected}
      />

      {option && <IngredientList option={option} />}

      {/* Compact LOG chip — was a full-width oversized red pill in v0.5.1.
          Now sized like the +ADD MEAL / +NEW PLAN chips elsewhere. Also
          the "already-logged" state renders as a ghost pill instead of a
          second loud red bar. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={submitLog}
          disabled={logging}
          style={{
            background: isLoggedToday
              ? 'transparent'
              : logging
                ? 'var(--color-surface-raised)'
                : 'var(--color-accent)',
            color: isLoggedToday
              ? 'var(--color-text-secondary)'
              : logging
                ? 'var(--color-text-disabled)'
                : 'var(--color-text-display)',
            border: isLoggedToday
              ? '1px solid var(--color-border-visible)'
              : 0,
            borderRadius: 'var(--radius-compact)',
            padding: 'var(--space-2) var(--space-4)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: logging ? 'not-allowed' : 'pointer',
          }}
        >
          {logging
            ? 'Logging…'
            : isLoggedToday
              ? `Logged · tap to re-log`
              : `+ Log option ${selected}`}
        </button>
        {adherenceOption != null && !isLoggedToday && (
          <span
            className="data"
            style={{
              color: 'var(--color-text-disabled)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
            }}
          >
            Prev: option {adherenceOption}
          </span>
        )}
      </div>
    </section>
  );
}

function TargetsLine({ targets }: { targets: PlanMeal['targets'] }) {
  return (
    <span
      className="data"
      style={{
        color: 'var(--color-text-secondary)',
        fontSize: 'var(--text-caption)',
        letterSpacing: '0.04em',
      }}
    >
      PROTEIN {targets.protein_g}G · CARBS {targets.carbs_g}G · FAT {targets.fat_g}G · {targets.calories_kcal} KCAL
    </span>
  );
}

function OptionChips({
  options,
  selected,
  onSelect,
}: {
  options: PlanMealOption[];
  selected: number;
  onSelect: (option: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Meal option"
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        overflowX: 'auto',
        paddingBottom: 'var(--space-2)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {options.map((o) => {
        const isSel = o.option === selected;
        const label = o.dish_en ?? o.dish_es;
        return (
          <button
            key={o.option}
            type="button"
            role="radio"
            aria-checked={isSel}
            onClick={() => onSelect(o.option)}
            style={{
              background: isSel ? 'var(--color-accent-subtle)' : 'transparent',
              color: isSel ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
              border: `1px solid ${isSel ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
              borderRadius: 'var(--radius-compact)',
              padding: 'var(--space-2) var(--space-3)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            OPTION {o.option}
            {label ? ` · ${label.toUpperCase()}` : ''}
          </button>
        );
      })}
    </div>
  );
}

function IngredientList({ option }: { option: PlanMealOption }) {
  // CSS grid handles the 2-column-where-fits behavior via
  // `repeat(auto-fill, minmax(...))`. At container widths <360px, one column;
  // above that, two columns share the row. Zero JS breakpoint math.
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
        gap: '0 var(--space-4)',
      }}
    >
      {option.ingredients.map((ing, idx) => (
        <IngredientRow key={idx} ing={ing} />
      ))}
    </ul>
  );
}

function IngredientRow({ ing }: { ing: Ingredient }) {
  const name = ingredientName(ing);
  const qty = ingredientQty(ing);
  return (
    <li
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
        <span
          style={{
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-body-sm)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {ing.free && <Badge>FREE</Badge>}
          {ing.generic && <Badge>GENERIC</Badge>}
        </div>
      </div>
      <span
        className="data"
        style={{
          color: 'var(--color-text-display)',
          fontSize: 'var(--text-body-sm)',
          whiteSpace: 'nowrap',
        }}
      >
        {qty}
      </span>
    </li>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="label"
      style={{
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-compact)',
        padding: '2px var(--space-2)',
        fontSize: '9px',
        letterSpacing: '0.1em',
      }}
    >
      {children}
    </span>
  );
}

function ingredientName(ing: Ingredient): string {
  const en = ing.name_en?.trim();
  const es = ing.name_es?.trim();
  if (en && es && en.toLowerCase() !== es.toLowerCase()) return `${en} · ${es}`;
  return en || es || 'Ingredient';
}

function ingredientQty(ing: Ingredient): string {
  if (ing.free || ing.quantity == null || ing.unit == null) return '—';
  return `${ing.quantity} ${ing.unit}`;
}
