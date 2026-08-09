'use client';

/**
 * CustomMealsPanel — MY MEALS list + save-new-meal flow for the TODAY view.
 *
 * Two collapsed states:
 *   1. Compact list of saved meals with `+ ADD` buttons. Tapping ADD posts a
 *      new calorie_entries row snapshotted from the meal's stored nutrition.
 *   2. `+ SAVE MEAL` inline form that captures name + snapshot of the current
 *      day's entries as a new custom meal template.
 *
 * The panel is deliberately self-contained — it manages its own fetch state
 * and never mutates parent state. It emits `calorie_entry_added` so the page
 * reloads today's entries after an ADD, matching the AddView contract.
 *
 * Design constraints: same card treatment as the rest of calorie-lite —
 * rgba(0,0,0,0.5) background, --color-border-visible outline, --radius-card,
 * --space-4 inner padding. Cadmium red only for CTAs.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CalorieEntry, CustomMeal, Meal } from '@nothing/shared';
import { EVENT_KINDS } from '@nothing/shared';
import { useEvents } from '@nothing/mini-apps-runtime';
import { useToast } from '../../../web/src/lib/toast/context';

const MEAL_OPTIONS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];

const CARD_STYLE = {
  background: 'rgba(0, 0, 0, 0.5)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'var(--space-3)',
};

const PRIMARY_BTN_STYLE = {
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  border: 0,
  borderRadius: 'var(--radius-button)',
  padding: 'var(--space-2) var(--space-4)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  cursor: 'pointer',
};

const SECONDARY_BTN_STYLE = {
  background: 'transparent',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-button)',
  padding: 'var(--space-2) var(--space-4)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  cursor: 'pointer',
};

const INPUT_STYLE = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-compact)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  outline: 'none',
};

export interface CustomMealsPanelProps {
  /**
   * Today's entries — used as the source of a "save meal from today" snapshot.
   * Empty array is fine; the save form just disables its submit button.
   */
  todayEntries: CalorieEntry[];
  /**
   * Default meal slot for the new entries created by tapping `+ ADD`. Pulled
   * from the parent so the "current time of day" heuristic stays in one place.
   */
  defaultMealSlot: Meal;
}

export function CustomMealsPanel({ todayEntries, defaultMealSlot }: CustomMealsPanelProps) {
  const events = useEvents();
  const { toast } = useToast();
  const [meals, setMeals] = useState<CustomMeal[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/custom-meals', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setLoadError('Could not load meals.');
        setMeals([]);
        return;
      }
      const body = (await res.json()) as { meals: CustomMeal[] };
      setMeals(body.meals);
    } catch {
      setLoadError('Network error.');
      setMeals([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addFromMeal = useCallback(
    async (meal: CustomMeal) => {
      try {
        const res = await fetch('/api/mini-apps/calorie-lite/entries', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            meal: meal.meal_slot ?? defaultMealSlot,
            kcal: Math.round(meal.kcal),
            raw_input: meal.name,
            protein_g: Math.round(meal.protein_g),
            carbs_g: Math.round(meal.carbs_g),
            fat_g: Math.round(meal.fat_g),
          }),
        });
        if (!res.ok) {
          toast.error('Could not add meal.');
          return;
        }
        events.emit(EVENT_KINDS.calorie_entry_added, { at: new Date().toISOString() });
        toast.info(`Added: ${meal.name}`);
      } catch {
        toast.error("Can't reach the server.");
      }
    },
    [defaultMealSlot, events, toast],
  );

  return (
    <section aria-label="My meals" style={CARD_STYLE}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
        }}
      >
        <span className="label">MY MEALS</span>
        <button
          type="button"
          onClick={() => setSaveOpen((v) => !v)}
          style={SECONDARY_BTN_STYLE}
          aria-expanded={saveOpen}
        >
          {saveOpen ? 'Close' : '+ Save meal'}
        </button>
      </div>

      {loadError && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {loadError}
        </p>
      )}

      {meals === null ? (
        <p className="caption">Loading…</p>
      ) : meals.length === 0 ? (
        <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          No saved meals yet. Save today&apos;s combo as a template to reuse it later.
        </p>
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
          {meals.map((m) => (
            <li
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) 0',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-1)',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--text-body-sm)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.name}
                </span>
                <span
                  className="data"
                  style={{
                    color: 'var(--color-text-disabled)',
                    fontSize: 'var(--text-caption)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {Math.round(m.kcal)} kcal · {Math.round(m.protein_g)}p/
                  {Math.round(m.carbs_g)}c/{Math.round(m.fat_g)}f
                </span>
              </div>
              <button
                type="button"
                onClick={() => void addFromMeal(m)}
                style={PRIMARY_BTN_STYLE}
                aria-label={`Add ${m.name} to today`}
              >
                + Add
              </button>
            </li>
          ))}
        </ul>
      )}

      {saveOpen && (
        <SaveMealForm
          todayEntries={todayEntries}
          onSaved={async () => {
            setSaveOpen(false);
            await load();
            toast.info('Meal saved.');
          }}
          onCancel={() => setSaveOpen(false)}
        />
      )}
    </section>
  );
}

function SaveMealForm({
  todayEntries,
  onSaved,
  onCancel,
}: {
  todayEntries: CalorieEntry[];
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [mealSlot, setMealSlot] = useState<Meal | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Snapshot today's entries into totals + components. If the user hasn't
  // logged anything today, disable the submit — an empty meal template is
  // useless and would just clutter MY MEALS.
  const totals = todayEntries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + (e.kcal ?? 0),
      protein_g: acc.protein_g + (e.protein_g ?? 0),
      carbs_g: acc.carbs_g + (e.carbs_g ?? 0),
      fat_g: acc.fat_g + (e.fat_g ?? 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  const canSubmit = name.trim().length > 0 && todayEntries.length > 0 && !saving;

  async function submit(evt: React.FormEvent) {
    evt.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      // Component snapshots — store one component per entry with a `qty_g`
      // stand-in. We don't have real grams from the current AddView, so use
      // kcal as the qty proxy; the display uses name_snapshot anyway.
      const components = todayEntries.map((e) => ({
        food_id: (e.food_id as string | undefined) ?? null,
        custom_food_id: e.custom_food_id ?? null,
        name_snapshot: e.raw_input?.trim() || 'Entry',
        // qty_g is required (positive number) on the schema. Fall back to 1g
        // when we don't have a real serving qty so the meal still saves.
        qty_g: e.serving_qty && e.serving_qty > 0 ? e.serving_qty : 1,
      }));
      const res = await fetch('/api/mini-apps/calorie-lite/custom-meals', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          meal_slot: mealSlot === '' ? null : mealSlot,
          components,
          kcal: totals.kcal,
          protein_g: totals.protein_g,
          carbs_g: totals.carbs_g,
          fat_g: totals.fat_g,
        }),
      });
      if (!res.ok) {
        setError('Could not save.');
        toast.error('Could not save meal.');
        setSaving(false);
        return;
      }
      await onSaved();
    } catch {
      setError('Network error.');
      toast.error("Can't reach the server.");
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        borderTop: '1px solid var(--color-border)',
        paddingTop: 'var(--space-3)',
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          MEAL NAME
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Oats + almond butter"
          maxLength={120}
          style={INPUT_STYLE}
          autoComplete="off"
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          DEFAULT SLOT (OPTIONAL)
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {MEAL_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMealSlot(mealSlot === m.id ? '' : m.id)}
              style={{
                background: mealSlot === m.id ? 'var(--color-text-display)' : 'transparent',
                color: mealSlot === m.id ? 'var(--color-bg)' : 'var(--color-text-primary)',
                border: `1px solid ${
                  mealSlot === m.id ? 'var(--color-text-display)' : 'var(--color-border-visible)'
                }`,
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-2) var(--space-3)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <p
        className="data"
        style={{
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-caption)',
        }}
      >
        SNAPSHOT: {totals.kcal.toLocaleString()} kcal · {totals.protein_g}p/{totals.carbs_g}c/
        {totals.fat_g}f · {todayEntries.length}{' '}
        {todayEntries.length === 1 ? 'entry' : 'entries'}
      </p>

      {error && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            ...PRIMARY_BTN_STYLE,
            background: canSubmit ? 'var(--color-accent)' : 'var(--color-surface-raised)',
            color: canSubmit ? 'var(--color-text-display)' : 'var(--color-text-disabled)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={SECONDARY_BTN_STYLE}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
