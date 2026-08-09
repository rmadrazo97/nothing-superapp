'use client';

/**
 * CustomFoodEditor — form to create or edit a custom food.
 *
 * Used inside the CUSTOM tab of the Add Meal flow. Handles both:
 *   - Create (`existing == null`) → POST /custom-foods
 *   - Edit   (`existing != null`) → PATCH /custom-foods/:id
 *
 * Emits `onSaved(record)` on success so the parent list can refresh without
 * an extra network round-trip. Fields mirror `customFoodInsertSchema`; we
 * validate lightly at the input layer and let the server Zod schema be the
 * ultimate authority.
 */

import { useState } from 'react';
import type { CustomFood } from '@nothing/shared';

interface CustomFoodEditorProps {
  existing?: CustomFood | null;
  onCancel: () => void;
  onSaved: (record: CustomFood) => void | Promise<void>;
  onError: (msg: string) => void;
  onSubscriptionRequired: () => void;
}

export function CustomFoodEditor({
  existing,
  onCancel,
  onSaved,
  onError,
  onSubscriptionRequired,
}: CustomFoodEditorProps) {
  const [name, setName] = useState(existing?.name ?? '');
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [servingG, setServingG] = useState(
    existing?.serving_g != null ? String(existing.serving_g) : '100',
  );
  const [servingLabel, setServingLabel] = useState(
    existing?.serving_label ?? '100 g',
  );
  const [kcal, setKcal] = useState(
    existing?.kcal != null ? String(existing.kcal) : '',
  );
  const [protein, setProtein] = useState(
    existing?.protein_g != null ? String(existing.protein_g) : '',
  );
  const [carbs, setCarbs] = useState(
    existing?.carbs_g != null ? String(existing.carbs_g) : '',
  );
  const [fat, setFat] = useState(
    existing?.fat_g != null ? String(existing.fat_g) : '',
  );
  const [saving, setSaving] = useState(false);

  const kcalN = Number(kcal);
  const servingGN = Number(servingG);
  const canSubmit =
    name.trim().length > 0 &&
    Number.isFinite(kcalN) &&
    kcalN >= 0 &&
    Number.isFinite(servingGN) &&
    servingGN > 0 &&
    !saving;

  function numOrZero(raw: string): number {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  async function submit(evt: React.FormEvent) {
    evt.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        brand: brand.trim() ? brand.trim() : null,
        serving_g: servingGN,
        serving_label: servingLabel.trim() || `${servingGN} g`,
        kcal: kcalN,
        protein_g: numOrZero(protein),
        carbs_g: numOrZero(carbs),
        fat_g: numOrZero(fat),
      };

      const url = existing
        ? `/api/mini-apps/calorie-lite/custom-foods/${existing.id}`
        : `/api/mini-apps/calorie-lite/custom-foods`;
      const method = existing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 402) onSubscriptionRequired();
        else if (res.status !== 401) onError('Could not save.');
        setSaving(false);
        return;
      }
      const body = (await res.json()) as { custom_food: CustomFood };
      await onSaved(body.custom_food);
    } catch {
      onError('Network error.');
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
        {existing ? 'EDIT CUSTOM FOOD' : 'NEW CUSTOM FOOD'}
      </span>

      <TextRow
        label="NAME"
        value={name}
        onChange={setName}
        placeholder="e.g. Mom's chili"
        required
      />
      <TextRow
        label="BRAND (OPTIONAL)"
        value={brand}
        onChange={setBrand}
        placeholder="e.g. Homemade"
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-3)',
        }}
      >
        <NumberRow
          label="SERVING (G)"
          value={servingG}
          onChange={setServingG}
          min={1}
          step={1}
          required
        />
        <TextRow
          label="SERVING LABEL"
          value={servingLabel}
          onChange={setServingLabel}
          placeholder="1 bowl"
        />
      </div>

      <NumberRow
        label="KCAL / SERVING"
        value={kcal}
        onChange={setKcal}
        min={0}
        step={1}
        required
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-3)',
        }}
      >
        <NumberRow
          label="PROTEIN (G)"
          value={protein}
          onChange={setProtein}
          min={0}
          step={0.1}
        />
        <NumberRow
          label="CARBS (G)"
          value={carbs}
          onChange={setCarbs}
          min={0}
          step={0.1}
        />
        <NumberRow
          label="FAT (G)"
          value={fat}
          onChange={setFat}
          min={0}
          step={0.1}
        />
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            background: canSubmit ? 'var(--color-accent)' : 'var(--color-surface-raised)',
            color: canSubmit ? 'var(--color-text-display)' : 'var(--color-text-disabled)',
            border: 0,
            borderRadius: 'var(--radius-button)',
            padding: 'var(--space-3) var(--space-6)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Create'}
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

function TextRow({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <input
        className="input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={120}
        required={required}
        autoComplete="off"
      />
    </label>
  );
}

function NumberRow({
  label,
  value,
  onChange,
  min,
  step,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  step?: number;
  required?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <input
        className="input"
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        required={required}
      />
    </label>
  );
}
