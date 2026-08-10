'use client';

/**
 * PlanMealCard — one station on the prescription timeline rail.
 *
 * v0.5.3 note: this used to be a self-contained card with its own border,
 * background, and padding. It now renders *inside* a <TimelineStation>
 * from PlanSignature.tsx — so the outer chrome is stripped and the meal
 * name / options / log CTA flow as flat content within the rail's right
 * column. The 6px AdherenceLED replaces the "already-logged / tap to
 * re-log" prose from v0.5.2.
 *
 * Data flow unchanged: on LOG, POST /meal-plans/log-meal → server inserts
 * one calorie_entry per quantified ingredient + upserts a plan_adherence
 * row for TODAY.
 */
import { useState } from 'react';
import type { PlanMeal, PlanMealOption, Ingredient } from '@nothing/shared';
import { AdherenceLED } from './PlanSignature.tsx';

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
        onError(
          body?.error === 'no_active_plan'
            ? 'Activate this plan first.'
            : body?.error === 'invalid_body'
              ? 'Log payload invalid.'
              : 'Could not log meal.',
        );
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
  const isLoggedToday = adherenceOption != null;
  const isThisOptionLogged = adherenceOption === selected;

  // Space-Mono target line with tabular numerals.
  const targetSummary = `${Math.round(meal.targets.calories_kcal)} KCAL  ·  P${Math.round(meal.targets.protein_g)}  C${Math.round(meal.targets.carbs_g)}  F${Math.round(meal.targets.fat_g)}`;

  return (
    <div
      aria-label={title}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {/* Header row — LED, meal name (Grotesk), then target summary below.
          No outer card border; the TimelineStation's gutter + hairline is
          the whole separator. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
            <AdherenceLED lit={isLoggedToday} />
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: 'var(--text-body)',
                color: 'var(--color-text-display)',
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </span>
          </div>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
            color: 'var(--color-text-secondary)',
            fontVariantNumeric: 'tabular-nums',
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

      {/* LOG chip — one compact affordance. When *this option* was already
          logged today, the chip switches to a subdued outlined state that
          still allows re-log; the AdherenceLED at the header is the primary
          "yes, done" signal so the chip doesn't need to shout. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={submitLog}
          disabled={logging}
          style={{
            background: isThisOptionLogged
              ? 'transparent'
              : logging
                ? 'var(--color-surface-raised)'
                : 'var(--color-accent)',
            color: isThisOptionLogged
              ? 'var(--color-text-secondary)'
              : logging
                ? 'var(--color-text-disabled)'
                : 'var(--color-text-display)',
            border: isThisOptionLogged
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
            : isThisOptionLogged
              ? 'Logged · re-log'
              : `+ Log option ${selected}`}
        </button>
        {isLoggedToday && !isThisOptionLogged && (
          <span
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: '10px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-disabled)',
            }}
          >
            Prev: opción {adherenceOption}
          </span>
        )}
      </div>
    </div>
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
        paddingBottom: 'var(--space-1)',
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
            <span style={{ color: isSel ? 'var(--color-accent)' : 'var(--color-text-disabled)', marginRight: 4 }}>
              {String(o.option).padStart(2, '0')}
            </span>
            {label ? label.toUpperCase() : `OPCIÓN ${o.option}`}
          </button>
        );
      })}
    </div>
  );
}

function IngredientList({ option }: { option: PlanMealOption }) {
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
        style={{
          color: 'var(--color-text-display)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-body-sm)',
          fontVariantNumeric: 'tabular-nums',
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
      style={{
        fontFamily: 'var(--font-label)',
        fontSize: '9px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-compact)',
        padding: '2px var(--space-2)',
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
