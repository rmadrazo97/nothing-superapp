'use client';

/**
 * CustomFoodList — the caller's own saved custom foods.
 *
 * Used inside the CUSTOM tab of the Add Meal flow. Renders:
 *   - "Create new" primary CTA at the top
 *   - Row per custom food (name, serving, kcal); tap → quantity picker
 *   - Edit + delete affordances on each row (delete confirms inline)
 *
 * The quantity picker is a lightweight local re-implementation rather than
 * a re-import of FoodSearch's picker — this way each tab is self-contained
 * and can render even if the other tab has never been mounted.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomFood, Meal } from '@nothing/shared';
import {
  computeEntryNutrition,
  macroPreview,
  type ServingUnit,
} from '../lib/nutrition.ts';
import { CustomFoodEditor } from './CustomFoodEditor.tsx';

interface CustomFoodListProps {
  meal: Meal;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
  onSubscriptionRequired: () => void;
}

type Mode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; food: CustomFood }
  | { kind: 'log'; food: CustomFood };

export function CustomFoodList({
  meal,
  onSaved,
  onError,
  onSubscriptionRequired,
}: CustomFoodListProps) {
  const [foods, setFoods] = useState<CustomFood[] | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/custom-foods', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        if (res.status === 402) onSubscriptionRequired();
        else if (res.status !== 401) onError('Could not load custom foods.');
        setFoods([]);
        return;
      }
      const body = (await res.json()) as { custom_foods: CustomFood[] };
      setFoods(body.custom_foods);
    } catch {
      onError('Network error.');
      setFoods([]);
    }
  }, [onError, onSubscriptionRequired]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/mini-apps/calorie-lite/custom-foods/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        if (res.status === 402) onSubscriptionRequired();
        else if (res.status !== 401) onError('Could not delete.');
        return;
      }
      setFoods((prev) => (prev ?? []).filter((f) => f.id !== id));
      setPendingDelete(null);
    } catch {
      onError('Network error.');
    }
  }

  if (mode.kind === 'create') {
    return (
      <CustomFoodEditor
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={async (record) => {
          setFoods((prev) => [record, ...(prev ?? [])]);
          setMode({ kind: 'list' });
        }}
        onError={onError}
        onSubscriptionRequired={onSubscriptionRequired}
      />
    );
  }

  if (mode.kind === 'edit') {
    return (
      <CustomFoodEditor
        existing={mode.food}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={async (record) => {
          setFoods((prev) =>
            (prev ?? []).map((f) => (f.id === record.id ? record : f)),
          );
          setMode({ kind: 'list' });
        }}
        onError={onError}
        onSubscriptionRequired={onSubscriptionRequired}
      />
    );
  }

  if (mode.kind === 'log') {
    return (
      <CustomFoodQuantityPicker
        food={mode.food}
        meal={meal}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={onSaved}
        onError={onError}
        onSubscriptionRequired={onSubscriptionRequired}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <button
        type="button"
        onClick={() => setMode({ kind: 'create' })}
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-text-display)',
          border: 0,
          borderRadius: 'var(--radius-button)',
          padding: 'var(--space-3) var(--space-6)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-label)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        + Create custom food
      </button>

      {foods === null ? (
        <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          Loading…
        </p>
      ) : foods.length === 0 ? (
        <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          No custom foods yet. Create one to reuse it across meals.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {foods.map((f) => (
            <CustomFoodRow
              key={f.id}
              food={f}
              pendingDelete={pendingDelete === f.id}
              onLog={() => setMode({ kind: 'log', food: f })}
              onEdit={() => setMode({ kind: 'edit', food: f })}
              onRequestDelete={() => setPendingDelete(f.id)}
              onCancelDelete={() => setPendingDelete(null)}
              onConfirmDelete={() => handleDelete(f.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomFoodRow({
  food,
  pendingDelete,
  onLog,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  food: CustomFood;
  pendingDelete: boolean;
  onLog: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <li
      style={{
        borderBottom: '1px solid var(--color-border)',
        padding: 'var(--space-3) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <button
        type="button"
        onClick={onLog}
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
          color: 'inherit',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0, flex: 1 }}>
          <span
            style={{
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-body)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {food.name}
          </span>
          <span
            className="data"
            style={{
              color: 'var(--color-text-disabled)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.04em',
            }}
          >
            {food.serving_label} · {macroPreview(food)}
          </span>
        </div>
        <span
          className="data"
          style={{
            color: 'var(--color-text-display)',
            fontSize: 'var(--text-body)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {Math.round(Number(food.kcal)).toLocaleString()}
          <span
            className="label"
            style={{ color: 'var(--color-text-secondary)', marginLeft: 2 }}
          >
            kcal
          </span>
        </span>
      </button>
      {pendingDelete ? (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <span className="caption" style={{ color: 'var(--color-accent)' }}>
            Delete this custom food?
          </span>
          <button
            type="button"
            onClick={onConfirmDelete}
            className="btn btn-secondary"
            style={{
              padding: 'var(--space-1) var(--space-3)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              color: 'var(--color-accent)',
              borderColor: 'var(--color-accent)',
            }}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            className="btn btn-secondary"
            style={{
              padding: 'var(--space-1) var(--space-3)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Keep
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            type="button"
            onClick={onEdit}
            style={{
              background: 'transparent',
              border: 0,
              padding: 0,
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            style={{
              background: 'transparent',
              border: 0,
              padding: 0,
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

// Small local quantity picker for custom foods. Kept separate from
// FoodSearch's picker so this tab doesn't depend on that module rendering.
function CustomFoodQuantityPicker({
  food,
  meal,
  onCancel,
  onSaved,
  onError,
  onSubscriptionRequired,
}: {
  food: CustomFood;
  meal: Meal;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
  onSubscriptionRequired: () => void;
}) {
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState<ServingUnit>('serving');
  const [saving, setSaving] = useState(false);

  const qtyN = Number(qty);
  const validQty = Number.isFinite(qtyN) && qtyN > 0;
  const preview = useMemo(
    () => computeEntryNutrition(food, validQty ? qtyN : 0, unit),
    [food, qtyN, unit, validQty],
  );

  async function submit(evt: React.FormEvent) {
    evt.preventDefault();
    if (!validQty || saving) return;
    setSaving(true);
    try {
      const nutrition = computeEntryNutrition(food, qtyN, unit);
      const res = await fetch('/api/mini-apps/calorie-lite/entries', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meal,
          kcal: nutrition.kcal,
          raw_input: `${food.name} · ${qtyN} ${unit}`,
          protein_g: nutrition.protein_g,
          carbs_g: nutrition.carbs_g,
          fat_g: nutrition.fat_g,
          fiber_g: nutrition.fiber_g,
          sugar_g: nutrition.sugar_g,
          sodium_mg: nutrition.sodium_mg,
          cholesterol_mg: nutrition.cholesterol_mg,
          custom_food_id: food.id,
          serving_qty: qtyN,
          serving_unit: unit,
        }),
      });
      if (!res.ok) {
        if (res.status === 402) onSubscriptionRequired();
        else if (res.status !== 401) onError('Could not save.');
        setSaving(false);
        return;
      }
      await onSaved();
    } catch {
      onError('Network error.');
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          MY FOOD
        </span>
        <span style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-subheading)' }}>
          {food.name}
        </span>
        <span
          className="data"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.04em',
          }}
        >
          1 {food.serving_label} · {macroPreview(food)} · {Math.round(Number(food.kcal))} kcal
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-3)',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            QUANTITY
          </span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={0.01}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            UNIT
          </span>
          <select
            className="input"
            value={unit}
            onChange={(e) => setUnit(e.target.value as ServingUnit)}
          >
            <option value="serving">serving</option>
            <option value="g">grams</option>
          </select>
        </label>
      </div>

      <div
        aria-label="Computed nutrition preview"
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--color-border-visible)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-3) var(--space-4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
        }}
      >
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          TOTAL
        </span>
        <span
          className="data"
          style={{
            color: 'var(--color-text-display)',
            fontSize: 'var(--text-heading)',
            fontWeight: 700,
          }}
        >
          {preview.kcal.toLocaleString()}
          <span
            className="label"
            style={{
              color: 'var(--color-text-secondary)',
              marginLeft: 'var(--space-2)',
            }}
          >
            kcal
          </span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button
          type="submit"
          disabled={!validQty || saving}
          style={{
            background: validQty && !saving ? 'var(--color-accent)' : 'var(--color-surface-raised)',
            color: validQty && !saving ? 'var(--color-text-display)' : 'var(--color-text-disabled)',
            border: 0,
            borderRadius: 'var(--radius-button)',
            padding: 'var(--space-3) var(--space-6)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: validQty && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn btn-secondary"
          style={{
            padding: 'var(--space-3) var(--space-6)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
