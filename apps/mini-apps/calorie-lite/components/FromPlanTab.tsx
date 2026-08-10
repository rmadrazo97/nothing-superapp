'use client';

/**
 * FromPlanTab — the fourth tab in the ADD MEAL sheet (v0.5.3 · #97).
 *
 * Lists the meal-plan options for the *current* meal slot (breakfast / lunch /
 * dinner / snacks) from the user's active plan. Tapping a row logs the whole
 * option via `POST /api/mini-apps/calorie-lite/meal-plans/log-meal` (task #76's
 * endpoint) — same call the PLAN tab uses.
 *
 * Data flow:
 *   1. Read `preferences.active_meal_plan_id` from the caller.
 *   2. GET  /api/mini-apps/calorie-lite/meal-plans/<id>  → plan blob.
 *   3. Filter `plan.meals` by matching the current MFP slot → plan.slot id via
 *      `mealSlotIdToMfpSlot` (shared helper — canonical mapping from plan slug
 *      to fixed slot enum).
 *   4. Render each matched meal's options as tap targets:
 *        `OPTION 2 · Eggs + tortilla · 550 kcal`
 *      kcal is the option's target — if the plan doesn't carry per-option
 *      targets (only per-meal), fall back to the meal target.
 *   5. Tap → POST log-meal with { meal_plan_id, meal_id, option_selected }.
 *
 * Empty states:
 *   - `activeMealPlanId == null` → CTA to switch to the PLAN tab.
 *   - Plan has no meals matching this slot → "No <slot> options in your active
 *     plan" + PLAN tab CTA.
 *
 * Failure states:
 *   - Fetch fail → inline retry chip.
 *   - Log fail → onError toast (matches other tabs' pattern).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Meal, PlanMeal } from '@nothing/shared';
import { mealSlotIdToMfpSlot } from '@nothing/shared';

interface PlanBlob {
  id: string;
  name: string;
  meals: PlanMeal[];
}

interface FromPlanTabProps {
  meal: Meal;
  activeMealPlanId: string | null;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
  onSubscriptionRequired: () => void;
  /** Called when the user wants to jump to the PLAN tab from an empty state. */
  onOpenPlanTab?: () => void;
}

function optionLabel(o: PlanMeal['options'][number]): string {
  const en = o.dish_en ?? o.label_en;
  const es = o.dish_es ?? o.label_es;
  return (en ?? es ?? `Option ${o.option}`).trim();
}

export function FromPlanTab({
  meal,
  activeMealPlanId,
  onSaved,
  onError,
  onSubscriptionRequired,
  onOpenPlanTab,
}: FromPlanTabProps) {
  const [plan, setPlan] = useState<PlanBlob | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyOptionKey, setBusyOptionKey] = useState<string | null>(null);

  const loadPlan = useCallback(async (id: string) => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch(`/api/mini-apps/calorie-lite/meal-plans/${id}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setLoadErr('Could not load plan.');
        setPlan(null);
        return;
      }
      const body = (await res.json()) as {
        meal_plan: { id: string; name: string; plan: { meals: PlanMeal[] } };
      };
      setPlan({
        id: body.meal_plan.id,
        name: body.meal_plan.name,
        meals: body.meal_plan.plan.meals ?? [],
      });
    } catch {
      setLoadErr('Network error.');
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeMealPlanId) void loadPlan(activeMealPlanId);
    else setPlan(null);
  }, [activeMealPlanId, loadPlan]);

  // Filter to meals whose canonical slot matches the current selector.
  // `mealSlotIdToMfpSlot` handles the free-form → enum mapping (desayuno →
  // breakfast, comida → lunch, cena → dinner, else → snacks).
  const matchingMeals = useMemo<PlanMeal[]>(() => {
    if (!plan) return [];
    return plan.meals.filter((m) => mealSlotIdToMfpSlot(m.id) === meal);
  }, [plan, meal]);

  async function logOption(m: PlanMeal, optionSelected: number) {
    if (!activeMealPlanId) return;
    const key = `${m.id}:${optionSelected}`;
    setBusyOptionKey(key);
    try {
      const res = await fetch(
        '/api/mini-apps/calorie-lite/meal-plans/log-meal',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            meal_plan_id: activeMealPlanId,
            meal_id: m.id,
            option_selected: optionSelected,
            override_slot: meal,
          }),
        },
      );
      if (!res.ok) {
        if (res.status === 402) onSubscriptionRequired();
        else {
          const body = await res.json().catch(() => null);
          onError(
            body?.error === 'no_active_plan'
              ? 'Activate a plan first.'
              : 'Could not log meal.',
          );
        }
        return;
      }
      await onSaved();
    } catch {
      onError('Network error.');
    } finally {
      setBusyOptionKey(null);
    }
  }

  // ── Render branches ─────────────────────────────────────────────────────

  if (!activeMealPlanId) {
    return (
      <EmptyPanel
        title="No active plan"
        body="Activate a meal plan on the PLAN tab to log its options from here."
        ctaLabel={onOpenPlanTab ? '→ Open PLAN tab' : undefined}
        onCta={onOpenPlanTab}
      />
    );
  }

  if (loading && plan === null) {
    return (
      <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
        Loading plan…
      </p>
    );
  }

  if (loadErr) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {loadErr}
        </p>
        <button
          type="button"
          onClick={() => activeMealPlanId && void loadPlan(activeMealPlanId)}
          className="data"
          style={{
            all: 'unset',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            padding: 'var(--space-2) var(--space-3)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-compact)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-text-primary)',
          }}
        >
          ↻ Retry
        </button>
      </div>
    );
  }

  if (matchingMeals.length === 0) {
    return (
      <EmptyPanel
        title={`No ${meal} options in your active plan`}
        body="Edit the plan or pick a different meal slot."
        ctaLabel={onOpenPlanTab ? '→ Open PLAN tab' : undefined}
        onCta={onOpenPlanTab}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
      <span
        className="caption"
        style={{
          color: 'var(--color-text-secondary)',
          letterSpacing: '0.06em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        FROM · {(plan?.name ?? 'Plan').toUpperCase()}
      </span>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          minWidth: 0,
        }}
      >
        {matchingMeals.map((m) => {
          const mealName = (m.name_en ?? m.name_es ?? m.id).trim();
          return (
            <li key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span
                className="label"
                style={{
                  color: 'var(--color-text-disabled)',
                  fontSize: 'var(--text-caption)',
                  letterSpacing: '0.06em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {String(m.order).padStart(2, '0')} · {mealName.toUpperCase()}
              </span>
              {m.options.map((o) => {
                const key = `${m.id}:${o.option}`;
                const busy = busyOptionKey === key;
                const kcal = Math.round(m.targets.calories_kcal ?? 0);
                const label = optionLabel(o);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void logOption(m, o.option)}
                    disabled={busy || busyOptionKey !== null}
                    style={{
                      all: 'unset',
                      cursor: busy ? 'wait' : busyOptionKey ? 'not-allowed' : 'pointer',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      alignItems: 'baseline',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3) var(--space-4)',
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid var(--color-border-visible)',
                      borderRadius: 'var(--radius-compact)',
                      opacity: busy ? 0.6 : 1,
                      // Overflow guards — long dish names must stay inside
                      // the shell's 480px column even on very small phones.
                      maxWidth: '100%',
                      minWidth: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        minWidth: 0,
                      }}
                    >
                      <span
                        className="data"
                        style={{
                          color: 'var(--color-text-secondary)',
                          fontSize: 'var(--text-caption)',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        OPTION {o.option}
                      </span>
                      <span
                        style={{
                          color: 'var(--color-text-display)',
                          fontSize: 'var(--text-body)',
                          overflow: 'hidden',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }}
                      >
                        {label}
                      </span>
                    </span>
                    <span
                      className="data"
                      style={{
                        color: 'var(--color-text-display)',
                        fontSize: 'var(--text-body-sm)',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        alignSelf: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {busy ? 'LOGGING…' : `${kcal.toLocaleString()} kcal`}
                    </span>
                  </button>
                );
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyPanel({
  title,
  body,
  ctaLabel,
  onCta,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-6) var(--space-4)',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px dashed var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        alignItems: 'flex-start',
      }}
    >
      <span
        className="label"
        style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}
      >
        ◐ {title}
      </span>
      <p
        className="caption"
        style={{ color: 'var(--color-text-secondary)', margin: 0 }}
      >
        {body}
      </p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="data"
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: 'var(--space-2) var(--space-3)',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-compact)',
            color: 'var(--color-accent)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
