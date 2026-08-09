'use client';

/**
 * MealPlanView — the PLAN tab.
 *
 * States:
 *   loading  — spinner-lite
 *   empty    — dashed "no active plan" card with SEE EXAMPLE toggle that
 *              inlines the reference fixture as a read-only preview so users
 *              understand the shape before their nutritionist ships them one.
 *   active   — rules card + one PlanMealCard per meal + adherence for today.
 *
 * Data flow:
 *   1. On mount, fetch preferences.active_meal_plan_id.
 *   2. If null, fetch list of all plans — if any exist, show a "pick which
 *      plan to activate" chooser; otherwise the true empty state.
 *   3. If active plan resolved, fetch it in full + today's adherence rows.
 *   4. Log a meal via <PlanMealCard>. On success, re-fetch adherence so the
 *      "LOGGED OPCIÓN N" chip lights up + entries event fires so TODAY
 *      refreshes.
 */
import { useCallback, useEffect, useState } from 'react';
import { useEvents, EmptyState } from '@nothing/mini-apps-runtime';
import { EVENT_KINDS } from '@nothing/shared';
import type { MealPlan, MealPlanAdherence, PlanMeal } from '@nothing/shared';
import { PlanRulesCard } from './PlanRulesCard.tsx';
import { PlanMealCard } from './PlanMealCard.tsx';
import { useToast } from '../../../web/src/lib/toast/context';
import referenceFixture from '../fixtures/diet-jam-v1.json';

interface MealPlanRow {
  id: string;
  name: string;
  plan: MealPlan['plan'];
  is_template: boolean;
  updated_at: string;
}

/** Local YYYY-MM-DD (matches server default). */
function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function MealPlanView({
  activeMealPlanId,
}: {
  activeMealPlanId: string | null;
}) {
  const events = useEvents();
  const { toast } = useToast();

  const [allPlans, setAllPlans] = useState<MealPlanRow[] | null>(null);
  const [activePlan, setActivePlan] = useState<MealPlanRow | null>(null);
  const [adherence, setAdherence] = useState<MealPlanAdherence[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/meal-plans', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setAllPlans([]);
        setLoadErr('Could not load plans.');
        return;
      }
      const body = (await res.json()) as { meal_plans: MealPlanRow[] };
      setAllPlans(body.meal_plans);
    } catch {
      setAllPlans([]);
      setLoadErr('Network error.');
    }
  }, []);

  const loadActive = useCallback(async (id: string) => {
    try {
      const [planRes, adhRes] = await Promise.all([
        fetch(`/api/mini-apps/calorie-lite/meal-plans/${id}`, {
          credentials: 'same-origin',
        }),
        fetch(
          `/api/mini-apps/calorie-lite/meal-plans/adherence?date=${todayKey()}`,
          { credentials: 'same-origin' },
        ),
      ]);
      if (!planRes.ok) {
        setActivePlan(null);
        return;
      }
      const planBody = (await planRes.json()) as { meal_plan: MealPlanRow };
      setActivePlan(planBody.meal_plan);
      if (adhRes.ok) {
        const adhBody = (await adhRes.json()) as { adherence: MealPlanAdherence[] };
        setAdherence(adhBody.adherence);
      } else {
        setAdherence([]);
      }
    } catch {
      setActivePlan(null);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (activeMealPlanId) {
      void loadActive(activeMealPlanId);
    } else {
      setActivePlan(null);
      setAdherence([]);
    }
  }, [activeMealPlanId, loadActive]);

  async function activate(id: string) {
    setActivating(id);
    try {
      const res = await fetch(
        `/api/mini-apps/calorie-lite/meal-plans/${id}/activate`,
        { method: 'POST', credentials: 'same-origin' },
      );
      if (!res.ok) {
        toast.error('Could not activate plan.');
        return;
      }
      toast.info('Plan activated. Reloading…');
      // Preferences drive activeMealPlanId in the layout, so reload to
      // rehydrate the server-rendered layout preferences.
      if (typeof window !== 'undefined') window.location.reload();
    } finally {
      setActivating(null);
    }
  }

  // ─── Empty state — no active plan ────────────────────────────────────────
  if (!activeMealPlanId) {
    if (allPlans === null) {
      return <p className="caption">Loading…</p>;
    }
    return (
      <EmptyPlanState
        loadErr={loadErr}
        allPlans={allPlans}
        activating={activating}
        onActivate={activate}
      />
    );
  }

  if (!activePlan) {
    return <p className="caption">Loading plan…</p>;
  }

  const meals = activePlan.plan.meals ?? [];
  const adhByMeal = new Map<string, MealPlanAdherence>();
  for (const a of adherence ?? []) adhByMeal.set(a.meal_id, a);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
        }}
      >
        <span className="label label-strong">
          PLAN · {activePlan.name.toUpperCase()}
        </span>
        {activePlan.plan.daily_targets && (
          <span
            className="data"
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
            }}
          >
            {activePlan.plan.daily_targets.calories_kcal} KCAL · P{activePlan.plan.daily_targets.protein_g} C{activePlan.plan.daily_targets.carbs_g} F{activePlan.plan.daily_targets.fat_g}
          </span>
        )}
      </div>

      <PlanRulesCard rules={activePlan.plan.rules ?? null} />

      {meals.length === 0 ? (
        <EmptyState icon="◐" title="Plan has no meals" body="Ask the copilot to add meals to this plan." />
      ) : (
        meals.map((meal: PlanMeal) => (
          <PlanMealCard
            key={meal.id}
            meal={meal}
            mealPlanId={activePlan.id}
            adherenceOption={adhByMeal.get(meal.id)?.option_selected ?? null}
            onLogged={(res) => {
              toast.info(
                res.inserted > 0
                  ? `Logged ${res.inserted} entries as opción ${res.option_selected}.`
                  : `Marked opción ${res.option_selected} as eaten.`,
              );
              // Refresh the TODAY view + our adherence.
              events.emit(EVENT_KINDS.calorie_entry_added, { at: new Date().toISOString() });
              void loadActive(activePlan.id);
            }}
            onError={(m) => toast.error(m)}
          />
        ))
      )}
    </div>
  );
}

// ─── Empty state — with chooser + example toggle ────────────────────────────

function EmptyPlanState({
  loadErr,
  allPlans,
  activating,
  onActivate,
}: {
  loadErr: string | null;
  allPlans: MealPlanRow[];
  activating: string | null;
  onActivate: (id: string) => void;
}) {
  const [showExample, setShowExample] = useState(false);
  const example = referenceFixture as unknown as MealPlan;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {loadErr && (
        <div
          role="alert"
          className="caption"
          style={{
            color: 'var(--color-accent)',
            padding: 'var(--space-3) var(--space-4)',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          {loadErr}
        </div>
      )}

      <section
        aria-label="No active meal plan"
        style={{
          background: 'transparent',
          border: '1px dashed var(--color-border-visible)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <span className="label">◐ NO ACTIVE MEAL PLAN</span>
        <p style={{ margin: 0, color: 'var(--color-text-primary)' }}>
          Ask the copilot to create one (paste your nutritionist&apos;s plan
          in the chat), or activate an existing plan below.
        </p>
        <button
          type="button"
          onClick={() => setShowExample((v) => !v)}
          style={{
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-compact)',
            padding: 'var(--space-2) var(--space-3)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          {showExample ? '◐ HIDE EXAMPLE' : '◐ SEE EXAMPLE'}
        </button>
      </section>

      {allPlans.length > 0 && (
        <section
          aria-label="Available meal plans"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <span className="label">YOUR PLANS</span>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {allPlans.map((p) => (
              <li
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  border: '1px solid var(--color-border-visible)',
                  borderRadius: 'var(--radius-card)',
                }}
              >
                <span style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
                <button
                  type="button"
                  onClick={() => onActivate(p.id)}
                  disabled={activating === p.id}
                  style={{
                    background: 'var(--color-accent)',
                    color: 'var(--color-text-display)',
                    border: 0,
                    borderRadius: 'var(--radius-button)',
                    padding: 'var(--space-2) var(--space-4)',
                    fontFamily: 'var(--font-label)',
                    fontSize: 'var(--text-label)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: activating === p.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  {activating === p.id ? 'Activating…' : 'Activate'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showExample && (
        <section
          aria-label="Reference plan preview"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            opacity: 0.85,
          }}
        >
          <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
            ◐ EXAMPLE PLAN (READ-ONLY) — DIET JAM
          </span>
          <PlanRulesCard rules={example.plan.rules ?? null} />
          {example.plan.meals.map((meal) => (
            <section
              key={meal.id}
              style={{
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--color-border-visible)',
                borderRadius: 'var(--radius-card)',
                padding: 'var(--space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <span className="label label-strong">
                {String(meal.order).padStart(2, '0')} · {meal.name_en ?? meal.name_es ?? meal.id}
              </span>
              <span
                className="data"
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--text-caption)',
                  letterSpacing: '0.04em',
                }}
              >
                {meal.targets.calories_kcal} KCAL · {meal.options.length} OPCIONES
              </span>
            </section>
          ))}
        </section>
      )}
    </div>
  );
}
