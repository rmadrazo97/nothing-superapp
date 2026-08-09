'use client';

/**
 * MacroGoalEditor — three-column P/C/F macro split editor.
 *
 * Live sum validation: the three percentage inputs must sum to exactly 100.
 * The save button in the parent form is gated on `isValid`. Below each field
 * we render the DERIVED grams for the current calorie target using the
 * standard Atwater factors (protein/carbs = 4 kcal/g, fat = 9 kcal/g) so the
 * user immediately sees what "30% protein at 2000 kcal" really means in
 * grams. Design-system tokens only — no hex colors, no non-scale spacing.
 */
import type { CSSProperties } from 'react';
import type { MacroGoalPct } from '@nothing/shared';

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

const FIELD_LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

const INPUT_STYLE: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-compact)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  outline: 'none',
};

const HINT_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-caption)',
  color: 'var(--color-text-secondary)',
};

/** Round to nearest gram — displays cleaner than fractional grams. */
function derivedGrams(pct: number, calories: number, kcalPerG: number): number {
  if (!Number.isFinite(pct) || !Number.isFinite(calories) || calories <= 0) return 0;
  return Math.round((pct / 100) * calories / kcalPerG);
}

export interface MacroGoalEditorProps {
  value: MacroGoalPct;
  calorieTarget: number;
  disabled?: boolean;
  onChange: (next: MacroGoalPct) => void;
  /** Reset any parent "saved" status when the user starts editing again. */
  onEdit?: () => void;
}

export function MacroGoalEditor({
  value,
  calorieTarget,
  disabled = false,
  onChange,
  onEdit,
}: MacroGoalEditorProps) {
  const sum = value.protein + value.carbs + value.fat;
  const isValid = Math.abs(sum - 100) < 0.5;

  function update(key: keyof MacroGoalPct, raw: string) {
    // Empty string maps to 0 so users can clear a field and retype without
    // the editor jumping to NaN. Non-numeric values also collapse to 0.
    const parsed = Number.parseInt(raw, 10);
    const n = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
    onChange({ ...value, [key]: n });
    onEdit?.();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <label style={FIELD_LABEL_STYLE}>Macro split — protein / carbs / fat (%)</label>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-3)',
        }}
      >
        <MacroField
          id="macro-protein"
          label="Protein"
          value={value.protein}
          disabled={disabled}
          derivedG={derivedGrams(value.protein, calorieTarget, KCAL_PER_G.protein)}
          onChange={(raw) => update('protein', raw)}
        />
        <MacroField
          id="macro-carbs"
          label="Carbs"
          value={value.carbs}
          disabled={disabled}
          derivedG={derivedGrams(value.carbs, calorieTarget, KCAL_PER_G.carbs)}
          onChange={(raw) => update('carbs', raw)}
        />
        <MacroField
          id="macro-fat"
          label="Fat"
          value={value.fat}
          disabled={disabled}
          derivedG={derivedGrams(value.fat, calorieTarget, KCAL_PER_G.fat)}
          onChange={(raw) => update('fat', raw)}
        />
      </div>
      <p
        style={{
          ...HINT_STYLE,
          color: isValid ? 'var(--color-text-secondary)' : 'var(--color-accent)',
        }}
      >
        {isValid
          ? `Sums to ${Math.round(sum)}%. Looks good.`
          : `Must sum to 100 — currently ${Math.round(sum)}%.`}
      </p>
    </div>
  );
}

function MacroField({
  id,
  label,
  value,
  disabled,
  derivedG,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled: boolean;
  derivedG: number;
  onChange: (raw: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <label htmlFor={id} style={FIELD_LABEL_STYLE}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={INPUT_STYLE}
      />
      <span
        className="data"
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--color-text-secondary)',
          letterSpacing: '0.04em',
        }}
      >
        ≈ {derivedG.toLocaleString()} g
      </span>
    </div>
  );
}
