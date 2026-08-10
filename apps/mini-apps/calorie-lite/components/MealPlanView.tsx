'use client';

/**
 * MealPlanView — the PLAN tab (v0.5.3 redesign).
 *
 * Design plan: services/growth/campaigns/nothing-superapp/design/plan-view-v0.5.3.md
 *
 * v0.5.2 shipped "a cleaner dashboard" and the user rejected it as generic.
 * v0.5.3 stops treating the plan as a dashboard. The plan detail is a
 * *prescription slip*: RX-kicker → Grotesk plan name → segmented macro
 * tape ticker (Doto numerals) → left-gutter meal timeline rail. The list
 * is a *cabinet of index cards* with a filled-red pushpin marking the
 * active plan.
 *
 * Signature primitives (see `PlanSignature.tsx`):
 *   <MacroTape>    4-cell tape strip, Doto numerals
 *   <Pushpin>      12px filled/hollow ember circle (ACTIVE marker)
 *   <AdherenceLED> 6px success-green dot per meal
 *   <TimelineRail> + <TimelineStation> — the numbered-gutter meal list
 *
 * Views (local state, no routing needed):
 *   list    — cabinet of pushpinned index cards, ACTIVE first
 *   detail  — prescription slip with tape ticker + timeline rail
 *   form    — worksheet (PlanForm handles this)
 *
 * Data flow (unchanged from v0.5.2 — B2 API confirmed no migration needed):
 *   GET    /api/mini-apps/calorie-lite/meal-plans
 *   GET    /api/mini-apps/calorie-lite/meal-plans/[id]
 *   POST   /api/mini-apps/calorie-lite/meal-plans          (create)
 *   PATCH  /api/mini-apps/calorie-lite/meal-plans/[id]     (edit)
 *   DELETE /api/mini-apps/calorie-lite/meal-plans/[id]     (destructive → undo)
 *   POST   /api/mini-apps/calorie-lite/meal-plans/[id]/activate
 *   DELETE /api/mini-apps/calorie-lite/meal-plans/[id]/activate
 *
 * Delete affordance: LIST swipe-action only. The v0.5.2 ⋯-menu in the
 * DETAIL header is *gone* — the header is for reading the prescription,
 * not for destroying it. Consistent with SwipeableRow semantics used
 * elsewhere in the shell.
 */
import { useCallback, useEffect, useState } from 'react';
import { useEvents, EmptyState } from '@nothing/mini-apps-runtime';
import { EVENT_KINDS } from '@nothing/shared';
import type { MealPlan, MealPlanAdherence, PlanMeal } from '@nothing/shared';
import { PlanRulesCard } from './PlanRulesCard.tsx';
import { PlanMealCard } from './PlanMealCard.tsx';
import { PlanForm } from './PlanForm.tsx';
import {
  MacroTape,
  Pushpin,
  TimelineRail,
  TimelineStation,
} from './PlanSignature.tsx';
import { SwipeableRow } from '../../../web/src/components/shell/SwipeableRow';
import { useToast } from '../../../web/src/lib/toast/context';

// ─── Local types ────────────────────────────────────────────────────────────

interface MealPlanRow {
  id: string;
  name: string;
  plan: MealPlan['plan'];
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

type Mode =
  | { view: 'list' }
  | { view: 'detail'; planId: string }
  | { view: 'form'; kind: 'create' }
  | { view: 'form'; kind: 'edit'; planId: string }
  | { view: 'form'; kind: 'duplicate'; sourcePlanId: string };

/** Local YYYY-MM-DD (matches server default). */
function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** ISO → RX-style stamp: "RX · 2026-08-10". Not a language toggle — this is
 * chrome, always English. */
function rxStamp(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `RX · ${y}-${m}-${day}`;
}

/** "just now" / "5m ago" / "2d ago" — compact. */
function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

// ─── Root component ─────────────────────────────────────────────────────────

export function MealPlanView({
  activeMealPlanId,
}: {
  activeMealPlanId: string | null;
}) {
  const [mode, setMode] = useState<Mode>({ view: 'list' });
  const [plans, setPlans] = useState<MealPlanRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const { toast } = useToast();

  const loadAll = useCallback(async () => {
    setLoadErr(null);
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/meal-plans', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setPlans([]);
        setLoadErr('Could not load plans.');
        return;
      }
      const body = (await res.json()) as { meal_plans: MealPlanRow[] };
      setPlans(body.meal_plans);
    } catch {
      setPlans([]);
      setLoadErr('Network error.');
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ─── Route by mode ────────────────────────────────────────────────────────

  if (mode.view === 'form') {
    const seedPlan =
      mode.kind === 'edit'
        ? plans?.find((p) => p.id === mode.planId) ?? null
        : mode.kind === 'duplicate'
          ? plans?.find((p) => p.id === mode.sourcePlanId) ?? null
          : null;

    return (
      <PlanForm
        initial={
          mode.kind === 'edit' && seedPlan
            ? { id: seedPlan.id, name: seedPlan.name, plan: seedPlan.plan }
            : mode.kind === 'duplicate' && seedPlan
              ? {
                  name: `${seedPlan.name} (Copy)`,
                  plan: seedPlan.plan,
                }
              : undefined
        }
        onCancel={() =>
          setMode(seedPlan?.id ? { view: 'detail', planId: seedPlan.id } : { view: 'list' })
        }
        onSaved={async (savedId) => {
          toast.success(mode.kind === 'edit' ? 'Plan saved.' : 'Plan created.');
          await loadAll();
          setMode({ view: 'detail', planId: savedId });
        }}
        onError={(m) => toast.error(m)}
      />
    );
  }

  if (mode.view === 'detail') {
    return (
      <PlanDetailView
        planId={mode.planId}
        activeMealPlanId={activeMealPlanId}
        libraryCount={plans?.length ?? 0}
        onBack={() => setMode({ view: 'list' })}
        onEdit={(id) => setMode({ view: 'form', kind: 'edit', planId: id })}
        onDuplicate={(id) =>
          setMode({ view: 'form', kind: 'duplicate', sourcePlanId: id })
        }
        onActivated={async () => {
          // Preferences drive the active pointer; reload the shell so the
          // TODAY tab + FromPlanDropdown pick up the change.
          if (typeof window !== 'undefined') window.location.reload();
        }}
      />
    );
  }

  // ─── LIST view (default) ──────────────────────────────────────────────────
  return (
    <PlanListView
      plans={plans}
      loadErr={loadErr}
      activeMealPlanId={activeMealPlanId}
      onCreate={() => setMode({ view: 'form', kind: 'create' })}
      onOpen={(id) => setMode({ view: 'detail', planId: id })}
      onEdit={(id) => setMode({ view: 'form', kind: 'edit', planId: id })}
      onDeleted={async () => {
        await loadAll();
      }}
      onActivated={async () => {
        if (typeof window !== 'undefined') window.location.reload();
      }}
    />
  );
}

// ─── LIST VIEW — "the cabinet" ──────────────────────────────────────────────

function PlanListView({
  plans,
  loadErr,
  activeMealPlanId,
  onCreate,
  onOpen,
  onEdit,
  onDeleted,
  onActivated,
}: {
  plans: MealPlanRow[] | null;
  loadErr: string | null;
  activeMealPlanId: string | null;
  onCreate: () => void;
  onOpen: (planId: string) => void;
  onEdit: (planId: string) => void;
  onDeleted: () => void | Promise<void>;
  onActivated: () => void | Promise<void>;
}) {
  const { toast } = useToast();

  async function activate(id: string) {
    const res = await fetch(
      `/api/mini-apps/calorie-lite/meal-plans/${id}/activate`,
      { method: 'POST', credentials: 'same-origin' },
    );
    if (!res.ok) {
      toast.error('Could not activate plan.');
      return;
    }
    toast.info('Plan activated. Reloading…');
    await onActivated();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/mini-apps/calorie-lite/meal-plans/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      toast.error('Could not delete plan.');
      return;
    }
    toast.success('Plan deleted.');
    await onDeleted();
  }

  const sorted = (plans ?? []).slice().sort((a, b) => {
    const aA = a.id === activeMealPlanId ? 1 : 0;
    const bA = b.id === activeMealPlanId ? 1 : 0;
    if (aA !== bA) return bA - aA;
    return b.updated_at.localeCompare(a.updated_at);
  });

  const totalCount = plans?.length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Kicker row — mono, tracked, no big title. The library COUNT is the
          only "number" here and it lives in the label bar, not in a hero. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          paddingBottom: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border-visible)',
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
          Plans
          <span style={{ color: 'var(--color-text-disabled)' }}>
            {'  ·  '}
            {String(totalCount).padStart(2, '0')} in library
          </span>
        </span>
        <button
          type="button"
          onClick={onCreate}
          style={{
            all: 'unset',
            cursor: 'pointer',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
            padding: 'var(--space-1) var(--space-2)',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-compact)',
            whiteSpace: 'nowrap',
          }}
          aria-label="Create a new plan"
        >
          + New
        </button>
      </div>

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

      {plans === null ? (
        <p className="caption">Loading…</p>
      ) : plans.length === 0 ? (
        <EmptyState
          icon="◐"
          title="No plans yet"
          body='Build one manually, or ask Copilot: "build me a 2000 kcal cutting plan".'
          primaryAction={{
            label: '+ Create a plan',
            onClick: onCreate,
            ariaLabel: 'Create a plan',
          }}
        />
      ) : (
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
          {sorted.map((p) => {
            const isActive = p.id === activeMealPlanId;
            return (
              <li key={p.id}>
                <SwipeableRow
                  ariaLabel={p.name}
                  actions={[
                    ...(isActive
                      ? []
                      : [
                          {
                            label: 'Set active',
                            kind: 'primary' as const,
                            onSelect: () => {
                              void activate(p.id);
                            },
                          },
                        ]),
                    {
                      label: 'Edit',
                      kind: 'primary' as const,
                      onSelect: () => onEdit(p.id),
                    },
                    {
                      label: 'Delete',
                      kind: 'destructive' as const,
                      undoLabel: 'PLAN DELETED',
                      onSelect: () => {
                        void remove(p.id);
                      },
                    },
                  ]}
                >
                  <PlanIndexCard
                    plan={p}
                    isActive={isActive}
                    onOpen={() => onOpen(p.id)}
                  />
                </SwipeableRow>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** An "index card" — pushpin gutter on the left, plan meta on the right. */
function PlanIndexCard({
  plan,
  isActive,
  onOpen,
}: {
  plan: MealPlanRow;
  isActive: boolean;
  onOpen: () => void;
}) {
  const dt = plan.plan.daily_targets;
  const kcal = dt ? Math.round(dt.calories_kcal) : null;
  const p = dt ? Math.round(dt.protein_g) : null;
  const c = dt ? Math.round(dt.carbs_g) : null;
  const f = dt ? Math.round(dt.fat_g) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: '28px 1fr auto',
        gap: 'var(--space-3)',
        alignItems: 'center',
        padding: 'var(--space-4)',
        border: '1px solid var(--color-border-visible)',
        borderLeft: isActive
          ? '2px solid var(--color-accent)'
          : '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        background: isActive ? 'rgba(215, 25, 33, 0.04)' : 'rgba(0, 0, 0, 0.5)',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Left: pushpin */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Pushpin active={isActive} size={14} />
      </div>

      {/* Middle: name + macro strip */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
        <span
          style={{
            color: 'var(--color-text-display)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 'var(--text-body)',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {plan.name}
        </span>
        {dt ? (
          <span
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
              color: 'var(--color-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {kcal} KCAL{'  ·  '}P{p}{'  '}C{c}{'  '}F{f}
          </span>
        ) : (
          <span
            className="caption"
            style={{ color: 'var(--color-text-disabled)' }}
          >
            no targets
          </span>
        )}
      </div>

      {/* Right: status stamp + relative time */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 'var(--space-1)',
          flexShrink: 0,
        }}
      >
        {isActive ? (
          <span
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: '10px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              padding: '2px 6px',
              borderRadius: '2px',
            }}
          >
            Active
          </span>
        ) : (
          <span
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: '10px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--color-text-disabled)',
              padding: '2px 6px',
            }}
          >
            —
          </span>
        )}
        <span
          className="caption"
          style={{
            color: 'var(--color-text-disabled)',
            fontSize: '11px',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
          }}
        >
          {relative(plan.updated_at)}
        </span>
      </div>
    </button>
  );
}

// ─── DETAIL VIEW — "the prescription slip" ──────────────────────────────────

function PlanDetailView({
  planId,
  activeMealPlanId,
  libraryCount,
  onBack,
  onEdit,
  onDuplicate,
  onActivated,
}: {
  planId: string;
  activeMealPlanId: string | null;
  libraryCount: number;
  onBack: () => void;
  onEdit: (planId: string) => void;
  onDuplicate: (planId: string) => void;
  onActivated: () => void | Promise<void>;
}) {
  const events = useEvents();
  const { toast } = useToast();

  const [plan, setPlan] = useState<MealPlanRow | null>(null);
  const [adherence, setAdherence] = useState<MealPlanAdherence[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const [planRes, adhRes] = await Promise.all([
        fetch(`/api/mini-apps/calorie-lite/meal-plans/${planId}`, {
          credentials: 'same-origin',
        }),
        fetch(
          `/api/mini-apps/calorie-lite/meal-plans/adherence?date=${todayKey()}`,
          { credentials: 'same-origin' },
        ),
      ]);
      if (!planRes.ok) {
        setLoadErr('Could not load plan.');
        return;
      }
      const planBody = (await planRes.json()) as { meal_plan: MealPlanRow };
      setPlan(planBody.meal_plan);
      if (adhRes.ok) {
        const adhBody = (await adhRes.json()) as { adherence: MealPlanAdherence[] };
        setAdherence(adhBody.adherence);
      } else {
        setAdherence([]);
      }
    } catch {
      setLoadErr('Network error.');
    }
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function activate() {
    const res = await fetch(
      `/api/mini-apps/calorie-lite/meal-plans/${planId}/activate`,
      { method: 'POST', credentials: 'same-origin' },
    );
    if (!res.ok) {
      toast.error('Could not activate plan.');
      return;
    }
    toast.info('Plan activated. Reloading…');
    await onActivated();
  }

  if (loadErr) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <BackRail onBack={onBack} libraryCount={libraryCount} />
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {loadErr}
        </p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <BackRail onBack={onBack} libraryCount={libraryCount} />
        <p className="caption">Loading…</p>
      </div>
    );
  }

  const isActive = plan.id === activeMealPlanId;
  const dt = plan.plan.daily_targets;
  const meals: PlanMeal[] = plan.plan.meals ?? [];
  const adhByMeal = new Map<string, MealPlanAdherence>();
  for (const a of adherence ?? []) adhByMeal.set(a.meal_id, a);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Back rail — mono, tracked, subordinate. Reads as breadcrumb, not a
          button. */}
      <BackRail onBack={onBack} libraryCount={libraryCount} />

      {/* Prescription header — kicker, name+pushpin, tape ticker. This
          replaces the v0.5.2 "PLAN · DIETA – … × DELETE / 2100 KCAL · P109…"
          cramped strip. */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
            }}
          >
            {rxStamp(plan.updated_at)}
            <span style={{ color: 'var(--color-text-disabled)' }}>
              {'  ·  updated '}
              {relative(plan.updated_at)}
            </span>
          </span>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: 'var(--text-heading)',
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
                color: 'var(--color-text-display)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {plan.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
              <Pushpin active={isActive} size={14} ariaLabel={isActive ? 'Active plan' : 'Not active'} />
            </div>
          </div>
        </div>

        {/* MACRO TAPE — the signature. */}
        {dt && (
          <MacroTape
            cells={[
              { label: 'KCAL', value: dt.calories_kcal },
              { label: 'P', value: dt.protein_g, suffix: 'g' },
              { label: 'C', value: dt.carbs_g, suffix: 'g' },
              { label: 'F', value: dt.fat_g, suffix: 'g' },
            ]}
            size="md"
          />
        )}

        {/* Action row — one primary (only if inactive) + two text links.
            No delete here; delete lives on the LIST swipe action. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            flexWrap: 'wrap',
          }}
        >
          {!isActive && (
            <button
              type="button"
              onClick={() => void activate()}
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-text-display)',
                border: 0,
                borderRadius: 'var(--radius-compact)',
                padding: 'var(--space-2) var(--space-4)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-caption)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Set active
            </button>
          )}
          <TextLink onClick={() => onEdit(plan.id)}>Edit</TextLink>
          <TextLink onClick={() => onDuplicate(plan.id)}>Duplicate</TextLink>
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-label)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--color-text-disabled)',
            }}
          >
            Delete via swipe on list
          </span>
        </div>
      </header>

      {/* Meals — timeline rail */}
      {meals.length === 0 ? (
        <EmptyState
          icon="◐"
          title="Plan has no meals"
          body="Edit this plan to add meals, or ask the copilot."
          primaryAction={{
            label: '+ Edit plan',
            onClick: () => onEdit(plan.id),
            ariaLabel: 'Edit plan',
          }}
        />
      ) : (
        <TimelineRail>
          {meals.map((meal, idx) => (
            <TimelineStation
              key={meal.id}
              order={meal.order}
              isLast={idx === meals.length - 1}
            >
              <PlanMealCard
                meal={meal}
                mealPlanId={plan.id}
                adherenceOption={adhByMeal.get(meal.id)?.option_selected ?? null}
                onLogged={(res) => {
                  toast.info(
                    res.inserted > 0
                      ? `Logged ${res.inserted} entries as option ${res.option_selected}.`
                      : `Marked option ${res.option_selected} as eaten.`,
                  );
                  events.emit(EVENT_KINDS.calorie_entry_added, {
                    at: new Date().toISOString(),
                  });
                  void load();
                }}
                onError={(m) => toast.error(m)}
              />
            </TimelineStation>
          ))}
        </TimelineRail>
      )}

      {/* Rules — kept as-is (collapsed disclosure), quiet at bottom. */}
      <PlanRulesCard rules={plan.plan.rules ?? null} />
    </div>
  );
}

// ─── UI primitives ──────────────────────────────────────────────────────────

function BackRail({
  onBack,
  libraryCount,
}: {
  onBack: () => void;
  libraryCount: number;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back to plans list"
      style={{
        all: 'unset',
        cursor: 'pointer',
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-text-secondary)',
      }}
    >
      <span aria-hidden>{'['}</span>
      <span aria-hidden>{'← Plans'}</span>
      <span
        aria-hidden
        style={{
          color: 'var(--color-text-disabled)',
        }}
      >
        / {String(libraryCount).padStart(2, '0')} in library
      </span>
      <span aria-hidden>{']'}</span>
    </button>
  );
}

function TextLink({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-caption)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-text-primary)',
        textDecoration: 'underline',
        textUnderlineOffset: 3,
        textDecorationColor: 'var(--color-border-visible)',
      }}
    >
      {children}
    </button>
  );
}
