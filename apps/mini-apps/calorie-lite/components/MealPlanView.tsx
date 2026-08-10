'use client';

/**
 * MealPlanView — the PLAN tab (v0.5.2 redesign).
 *
 * User feedback (2026-08-10): "this UI is horrible. I cannot see other plans /
 * edit / add other plans, only one active that was only created by the
 * assistant." — so this rewrite is LIST-first, adds a full CREATE/EDIT form,
 * and moves the DELETE affordance out of the header down into a menu with
 * an undo snackbar.
 *
 * Views (local state, no routing needed):
 *   list    — default landing; shows every plan with active-first sort
 *   detail  — one plan, redesigned; SET ACTIVE / EDIT / DUPLICATE / ⋯
 *   form    — create or edit; assembles a MealPlanInsert payload
 *
 * Data flow:
 *   - `preferences.active_meal_plan_id` (passed from the layout) tells us
 *     which plan is currently active
 *   - GET /api/mini-apps/calorie-lite/meal-plans → list of plans
 *   - GET /api/mini-apps/calorie-lite/meal-plans/[id] → detail + rules + meals
 *   - POST /api/mini-apps/calorie-lite/meal-plans → create
 *   - PATCH /api/mini-apps/calorie-lite/meal-plans/[id] → edit
 *   - DELETE /api/mini-apps/calorie-lite/meal-plans/[id] → destructive (undo)
 *   - POST /api/mini-apps/calorie-lite/meal-plans/[id]/activate → set active
 *   - DELETE /api/mini-apps/calorie-lite/meal-plans/[id]/activate → clear active
 *
 * All destructive actions route through the shell's <UndoSnackbar> via
 * <SwipeableRow> — the DELETE that used to sit at the header level is now
 * a swipe-left action + a ⋯ menu item in detail view.
 */
import { useCallback, useEffect, useState } from 'react';
import { useEvents, EmptyState } from '@nothing/mini-apps-runtime';
import { EVENT_KINDS } from '@nothing/shared';
import type { MealPlan, MealPlanAdherence, PlanMeal } from '@nothing/shared';
import { PlanRulesCard } from './PlanRulesCard.tsx';
import { PlanMealCard } from './PlanMealCard.tsx';
import { PlanForm } from './PlanForm.tsx';
import { SwipeableRow } from '../../../web/src/components/shell/SwipeableRow';
import { useUndoSnackbar } from '../../../web/src/components/shell/UndoSnackbar';
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

/** "2 days ago" / "just now" — small, readable relative time. */
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
    // Look up the source row for edit / duplicate.
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
                  // Duplicate = pre-filled form but CREATE semantics — id is
                  // undefined so PlanForm's isEdit gate stays false.
                  name: `${seedPlan.name} (Copy)`,
                  plan: seedPlan.plan,
                }
              : undefined
        }
        onCancel={() => setMode(seedPlan?.id ? { view: 'detail', planId: seedPlan.id } : { view: 'list' })}
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
        onBack={() => setMode({ view: 'list' })}
        onEdit={(id) => setMode({ view: 'form', kind: 'edit', planId: id })}
        onDuplicate={(id) =>
          setMode({ view: 'form', kind: 'duplicate', sourcePlanId: id })
        }
        onDeleted={async () => {
          await loadAll();
          setMode({ view: 'list' });
        }}
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

// ─── LIST VIEW ──────────────────────────────────────────────────────────────

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

  // Sort: active first, then most-recently-updated.
  const sorted = (plans ?? []).slice().sort((a, b) => {
    const aA = a.id === activeMealPlanId ? 1 : 0;
    const bA = b.id === activeMealPlanId ? 1 : 0;
    if (aA !== bA) return bA - aA;
    return b.updated_at.localeCompare(a.updated_at);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header — matches the +ADD MEAL chip on TODAY. Compact chip, not the
          oversized pill that showed up briefly in v0.5.1. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span className="label">PLANS</span>
          <span
            className="display-md"
            style={{ fontSize: 'var(--text-heading)', lineHeight: 1 }}
          >
            Your Plans
          </span>
        </div>
        <button
          type="button"
          onClick={onCreate}
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-text-display)',
            border: 0,
            borderRadius: 'var(--radius-compact)',
            padding: 'var(--space-2) var(--space-4)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          + New Plan
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
            gap: 'var(--space-2)',
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
                  <PlanRow
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

function PlanRow({
  plan,
  isActive,
  onOpen,
}: {
  plan: MealPlanRow;
  isActive: boolean;
  onOpen: () => void;
}) {
  const dt = plan.plan.daily_targets;
  const summary = dt
    ? `${Math.round(dt.calories_kcal)} KCAL · P${Math.round(dt.protein_g)} · C${Math.round(dt.carbs_g)} · F${Math.round(dt.fat_g)}`
    : '—';

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        padding: 'var(--space-3) var(--space-4)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        background: 'rgba(0, 0, 0, 0.5)',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
        }}
      >
        <span
          style={{
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-body)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {plan.name}
        </span>
        {isActive && (
          <span
            className="data"
            style={{
              color: 'var(--color-text-display)',
              background: 'var(--color-accent)',
              padding: '2px var(--space-2)',
              borderRadius: 'var(--radius-compact)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            Active
          </span>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <span
          className="data"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.04em',
          }}
        >
          {summary}
        </span>
        <span
          className="data"
          style={{
            color: 'var(--color-text-disabled)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
          }}
        >
          {relative(plan.created_at)}
        </span>
      </div>
    </button>
  );
}

// ─── DETAIL VIEW ────────────────────────────────────────────────────────────

function PlanDetailView({
  planId,
  activeMealPlanId,
  onBack,
  onEdit,
  onDuplicate,
  onDeleted,
  onActivated,
}: {
  planId: string;
  activeMealPlanId: string | null;
  onBack: () => void;
  onEdit: (planId: string) => void;
  onDuplicate: (planId: string) => void;
  onDeleted: () => void | Promise<void>;
  onActivated: () => void | Promise<void>;
}) {
  const events = useEvents();
  const { toast } = useToast();
  const { showUndo } = useUndoSnackbar();

  const [plan, setPlan] = useState<MealPlanRow | null>(null);
  const [adherence, setAdherence] = useState<MealPlanAdherence[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  function requestDelete() {
    setMenuOpen(false);
    showUndo({
      label: 'PLAN DELETED',
      onUndo: () => {},
      onCommit: async () => {
        const res = await fetch(
          `/api/mini-apps/calorie-lite/meal-plans/${planId}`,
          { method: 'DELETE', credentials: 'same-origin' },
        );
        if (!res.ok) {
          toast.error('Could not delete plan.');
          return;
        }
        toast.success('Plan deleted.');
        await onDeleted();
      },
      duration: 5000,
    });
  }

  if (loadErr) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <BackLink onBack={onBack} />
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {loadErr}
        </p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <BackLink onBack={onBack} />
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
      {/* Header — back link + name + ACTIVE chip */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <BackLink onBack={onBack} />
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <span
            className="display-md"
            style={{ fontSize: 'var(--text-heading)', lineHeight: 1 }}
          >
            {plan.name}
          </span>
          {isActive && (
            <span
              className="data"
              style={{
                color: 'var(--color-text-display)',
                background: 'var(--color-accent)',
                padding: '2px var(--space-2)',
                borderRadius: 'var(--radius-compact)',
                fontSize: 'var(--text-caption)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Active
            </span>
          )}
        </div>
        {dt && (
          <span
            className="data"
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.04em',
            }}
          >
            {Math.round(dt.calories_kcal)} KCAL · P{Math.round(dt.protein_g)} · C{Math.round(dt.carbs_g)} · F{Math.round(dt.fat_g)}
          </span>
        )}
      </div>

      {/* Action row — SET ACTIVE / EDIT / DUPLICATE / ⋯ */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
          position: 'relative',
        }}
      >
        {!isActive && (
          <ActionChip primary onClick={() => void activate()}>
            Set active
          </ActionChip>
        )}
        <ActionChip onClick={() => onEdit(plan.id)}>Edit</ActionChip>
        <ActionChip onClick={() => onDuplicate(plan.id)}>Duplicate</ActionChip>
        <ActionChip
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋯
        </ActionChip>
        {menuOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + var(--space-2))',
              right: 0,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 180,
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-compact)',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={requestDelete}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: 'var(--space-3) var(--space-4)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-caption)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-accent)',
              }}
            >
              × Delete plan
            </button>
          </div>
        )}
      </div>

      {/* Meals */}
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
        meals.map((meal: PlanMeal) => (
          <PlanMealCard
            key={meal.id}
            meal={meal}
            mealPlanId={plan.id}
            adherenceOption={adhByMeal.get(meal.id)?.option_selected ?? null}
            onLogged={(res) => {
              toast.info(
                res.inserted > 0
                  ? `Logged ${res.inserted} entries as option ${res.option_selected}.`
                  : `Marked option ${res.option_selected} as eaten.`,
              );
              events.emit(EVENT_KINDS.calorie_entry_added, { at: new Date().toISOString() });
              void load();
            }}
            onError={(m) => toast.error(m)}
          />
        ))
      )}

      {/* Rules — collapsed by default (already the PlanRulesCard behavior) */}
      <PlanRulesCard rules={plan.plan.rules ?? null} />
    </div>
  );
}

// ─── UI primitives ──────────────────────────────────────────────────────────

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        all: 'unset',
        cursor: 'pointer',
        color: 'var(--color-text-secondary)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-caption)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        alignSelf: 'flex-start',
      }}
      aria-label="Back to plans list"
    >
      ← Back to plans
    </button>
  );
}

function ActionChip({
  primary,
  children,
  onClick,
  ...rest
}: {
  primary?: boolean;
  children: React.ReactNode;
  onClick: () => void;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: primary ? 'var(--color-accent)' : 'transparent',
        color: primary ? 'var(--color-text-display)' : 'var(--color-text-primary)',
        border: primary ? 0 : '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-compact)',
        padding: 'var(--space-2) var(--space-3)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-caption)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
