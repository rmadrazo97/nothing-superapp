'use client';

/**
 * FromPlanDropdown — small "◐ FROM PLAN" chip on TODAY that opens a menu
 * of the active plan's meals; picking one logs its option 1 (the default
 * option in the PLAN tab is also opción 1) so the user can log without
 * navigating away.
 *
 * If no active plan, the chip stays inert with a hint tooltip. Kept as a
 * separate component so the TODAY view file stays small.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEvents } from '@nothing/mini-apps-runtime';
import { EVENT_KINDS } from '@nothing/shared';
import { useToast } from '../../../web/src/lib/toast/context';

interface PlanShape {
  id: string;
  name: string;
  meals: Array<{
    id: string;
    order: number;
    name_en?: string;
    name_es?: string;
    options: Array<{ option: number; label_es?: string; label_en?: string }>;
  }>;
}

export function FromPlanDropdown({
  activeMealPlanId,
}: {
  activeMealPlanId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<PlanShape | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const events = useEvents();

  const loadPlan = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/mini-apps/calorie-lite/meal-plans/${id}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        meal_plan: { id: string; name: string; plan: { meals: PlanShape['meals'] } };
      };
      setPlan({
        id: body.meal_plan.id,
        name: body.meal_plan.name,
        meals: body.meal_plan.plan.meals ?? [],
      });
    } catch {
      /* silent — the empty menu is fine */
    }
  }, []);

  useEffect(() => {
    if (activeMealPlanId) void loadPlan(activeMealPlanId);
    else setPlan(null);
  }, [activeMealPlanId, loadPlan]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(evt: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(evt.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function logMeal(mealId: string, optionSelected: number) {
    if (!activeMealPlanId) return;
    setLogging(mealId);
    try {
      const res = await fetch(
        '/api/mini-apps/calorie-lite/meal-plans/log-meal',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            meal_plan_id: activeMealPlanId,
            meal_id: mealId,
            option_selected: optionSelected,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(
          body?.error === 'no_active_plan'
            ? 'Activate a plan first.'
            : 'Could not log meal.',
        );
        return;
      }
      const body = (await res.json()) as { inserted: number };
      toast.info(`Logged ${body.inserted} entries from your plan.`);
      events.emit(EVENT_KINDS.calorie_entry_added, { at: new Date().toISOString() });
      setOpen(false);
    } catch {
      toast.error('Network error.');
    } finally {
      setLogging(null);
    }
  }

  const disabled = !activeMealPlanId;

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => (disabled ? toast.info('Activate a meal plan first.') : setOpen((v) => !v))}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          background: 'transparent',
          color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
          border: `1px solid ${disabled ? 'var(--color-border)' : 'var(--color-border-visible)'}`,
          borderRadius: 'var(--radius-button)',
          padding: 'var(--space-3) var(--space-4)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-label)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        ◐ From plan
      </button>

      {open && plan && (
        <div
          role="menu"
          aria-label="Log meal from plan"
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--space-2))',
            right: 0,
            zIndex: 20,
            minWidth: 260,
            maxHeight: 400,
            overflowY: 'auto',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-card)',
            padding: 'var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
          }}
        >
          <span
            className="label"
            style={{ color: 'var(--color-text-secondary)', padding: 'var(--space-1) var(--space-2)' }}
          >
            {plan.name.toUpperCase()}
          </span>
          {plan.meals.map((meal) => {
            const title = meal.name_en ?? meal.name_es ?? meal.id;
            const firstOption = meal.options[0]?.option ?? 1;
            return (
              <button
                key={meal.id}
                type="button"
                role="menuitem"
                disabled={logging === meal.id}
                onClick={() => logMeal(meal.id, firstOption)}
                style={{
                  background: 'transparent',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-compact)',
                  padding: 'var(--space-2) var(--space-3)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-body-sm)',
                  textAlign: 'left',
                  cursor: logging === meal.id ? 'wait' : 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 'var(--space-3)',
                }}
              >
                <span>
                  {String(meal.order).padStart(2, '0')} · {title}
                </span>
                <span
                  className="data"
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--text-caption)',
                    letterSpacing: '0.06em',
                  }}
                >
                  {logging === meal.id ? 'LOGGING…' : `OPCIÓN ${firstOption}`}
                </span>
              </button>
            );
          })}
          <span
            className="caption"
            style={{ color: 'var(--color-text-disabled)', padding: 'var(--space-1) var(--space-2)' }}
          >
            To pick a different option, use the PLAN tab.
          </span>
        </div>
      )}
    </div>
  );
}
