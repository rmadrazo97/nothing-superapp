'use client';

/**
 * PlanForm — create or edit a meal plan without needing the assistant.
 *
 * Reached via `+ NEW PLAN` (create) or a plan card's EDIT action (edit).
 * Renders a single scroll form (not a wizard) with:
 *   - Plan name
 *   - Target kcal + macro split (Balanced / High-P / Keto / Custom)
 *   - Repeater of meals; each meal has a repeater of options; each option
 *     has an ingredient repeater
 *   - Rules textarea
 *
 * The server stores plans as jsonb (`meal_plans.plan`), so we assemble a
 * `MealPlanInsert` shape and POST /api/mini-apps/calorie-lite/meal-plans
 * (or PATCH /:id for edit). No new API needed.
 *
 * Design constraints:
 *   - Nothing OS chrome; English labels only. User content (ingredient names)
 *     stays whatever they type.
 *   - No hex colors — tokens only. No --space-5 / --space-7 (skipped scale).
 */

import { useMemo, useState, type CSSProperties } from 'react';
import type { MealPlan, MealPlanInsert } from '@nothing/shared';
import { MacroTape, SectionRule } from './PlanSignature.tsx';

// ─── Types ──────────────────────────────────────────────────────────────────

type MacroPreset = 'balanced' | 'highP' | 'keto' | 'custom';

const MACRO_PRESETS: Record<
  Exclude<MacroPreset, 'custom'>,
  { label: string; p: number; c: number; f: number }
> = {
  balanced: { label: 'BALANCED', p: 0.3, c: 0.4, f: 0.3 },
  highP:    { label: 'HIGH-P',   p: 0.4, c: 0.3, f: 0.3 },
  keto:     { label: 'KETO',     p: 0.25, c: 0.05, f: 0.7 },
};

// A meal in the editor. Ingredients are one flat editable list per option.
// We keep a stable client-side key on each meal + option + ingredient so React
// re-orders don't blow away input focus while typing.
interface DraftIngredient {
  key: string;
  name: string;
  quantity: string; // string in the editor so empty inputs don't coerce
  unit: 'g' | 'ml' | 'unit';
  free: boolean;
}

interface DraftOption {
  key: string;
  dish: string;
  ingredients: DraftIngredient[];
}

interface DraftMeal {
  key: string;
  id: string;   // slug (breakfast / lunch / dinner / snacks / snack1)
  name: string; // display name
  order: number;
  options: DraftOption[];
  // Per-meal targets are computed from daily target + share (equal split
  // across meals by default). We keep it editable-later; for v1 we split evenly.
}

interface DraftPlan {
  name: string;
  kcal: string;
  preset: MacroPreset;
  customP: string;
  customC: string;
  customF: string;
  rules: string;
  meals: DraftMeal[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `k${keyCounter}`;
}

const DEFAULT_MEAL_SLOTS = [
  { id: 'breakfast', name: 'Breakfast' },
  { id: 'lunch',     name: 'Lunch' },
  { id: 'dinner',    name: 'Dinner' },
  { id: 'snacks',    name: 'Snacks' },
] as const;

function makeDraftMeal(slot: { id: string; name: string }, order: number): DraftMeal {
  return {
    key: nextKey(),
    id: slot.id,
    name: slot.name,
    order,
    options: [makeDraftOption()],
  };
}

function makeDraftOption(): DraftOption {
  return {
    key: nextKey(),
    dish: '',
    ingredients: [makeDraftIngredient()],
  };
}

function makeDraftIngredient(): DraftIngredient {
  return {
    key: nextKey(),
    name: '',
    quantity: '',
    unit: 'g',
    free: false,
  };
}

function emptyDraft(): DraftPlan {
  return {
    name: '',
    kcal: '2000',
    preset: 'balanced',
    customP: '150',
    customC: '200',
    customF: '65',
    rules: '',
    meals: DEFAULT_MEAL_SLOTS.map((slot, idx) => makeDraftMeal(slot, idx + 1)),
  };
}

/** Turn an existing plan into an editable draft. */
function draftFromPlan(name: string, plan: MealPlan['plan'], rules: string): DraftPlan {
  const kcal = plan.daily_targets?.calories_kcal ?? 2000;
  const p = plan.daily_targets?.protein_g ?? 150;
  const c = plan.daily_targets?.carbs_g ?? 200;
  const f = plan.daily_targets?.fat_g ?? 65;

  // Try to detect a matching preset.
  const preset = detectPreset(kcal, p, c, f);

  return {
    name,
    kcal: String(kcal),
    preset,
    customP: String(p),
    customC: String(c),
    customF: String(f),
    rules,
    meals: plan.meals.map((m, idx) => ({
      key: nextKey(),
      id: m.id,
      name: m.name_en ?? m.name_es ?? m.id,
      order: m.order ?? idx + 1,
      options: (m.options ?? []).map((o) => ({
        key: nextKey(),
        dish: o.dish_en ?? o.dish_es ?? '',
        ingredients: (o.ingredients ?? []).map((ing) => ({
          key: nextKey(),
          name: ing.name_en ?? ing.name_es ?? '',
          quantity: ing.quantity != null ? String(ing.quantity) : '',
          unit: (ing.unit ?? 'g') as 'g' | 'ml' | 'unit',
          free: ing.free ?? false,
        })),
      })),
    })),
  };
}

/** Very loose match — used only to preselect a preset chip on edit. */
function detectPreset(kcal: number, p: number, c: number, f: number): MacroPreset {
  if (kcal <= 0) return 'custom';
  const pPct = (p * 4) / kcal;
  const cPct = (c * 4) / kcal;
  const fPct = (f * 9) / kcal;
  const within = (a: number, b: number, tol = 0.05) => Math.abs(a - b) < tol;
  if (within(pPct, 0.3) && within(cPct, 0.4) && within(fPct, 0.3)) return 'balanced';
  if (within(pPct, 0.4) && within(cPct, 0.3) && within(fPct, 0.3)) return 'highP';
  if (within(pPct, 0.25) && within(cPct, 0.05, 0.08) && within(fPct, 0.7, 0.08)) return 'keto';
  return 'custom';
}

/** Compute macro grams from kcal + preset. */
function macrosForPreset(kcal: number, preset: MacroPreset, custom: { p: number; c: number; f: number }) {
  if (preset === 'custom') return custom;
  const split = MACRO_PRESETS[preset];
  return {
    p: Math.round((kcal * split.p) / 4),
    c: Math.round((kcal * split.c) / 4),
    f: Math.round((kcal * split.f) / 9),
  };
}

// ─── Public component ───────────────────────────────────────────────────────

export interface PlanFormProps {
  /**
   * When editing, pass the existing plan (WITH id). For DUPLICATE, pass the
   * seed plan with `id: undefined` — the form still pre-fills every field
   * but treats save as CREATE.
   */
  initial?: {
    id?: string;
    name: string;
    plan: MealPlan['plan'];
  };
  onCancel: () => void;
  /** Called with the id of the new/updated plan on save. */
  onSaved: (planId: string) => void;
  onError: (message: string) => void;
}

export function PlanForm({ initial, onCancel, onSaved, onError }: PlanFormProps) {
  // Edit-vs-create keys on whether we have a real id — duplicate seeds
  // `initial` with the source plan's shape but no id, so we POST new.
  const isEdit = initial?.id != null && initial.id.length > 0;

  const initialRules = useMemo(() => {
    // We stash freeform rules under plan.rules; the schema shape is rich but
    // for the form we treat the WHOLE rules block as a single textarea to
    // keep the surface tight. If the user came in via the assistant with a
    // structured rules object, we round-trip only the textual summary.
    if (!initial?.plan.rules) return '';
    return JSON.stringify(initial.plan.rules, null, 2);
  }, [initial]);

  const [draft, setDraft] = useState<DraftPlan>(() =>
    initial ? draftFromPlan(initial.name, initial.plan, initialRules) : emptyDraft(),
  );
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const kcalNum = Math.max(0, Math.round(Number(draft.kcal) || 0));
  const custom = {
    p: Math.max(0, Math.round(Number(draft.customP) || 0)),
    c: Math.max(0, Math.round(Number(draft.customC) || 0)),
    f: Math.max(0, Math.round(Number(draft.customF) || 0)),
  };
  const macros = macrosForPreset(kcalNum, draft.preset, custom);

  // ─── Draft mutators ───────────────────────────────────────────────────────

  function updateDraft(patch: Partial<DraftPlan>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function updateMeal(mealKey: string, patch: Partial<DraftMeal>) {
    setDraft((prev) => ({
      ...prev,
      meals: prev.meals.map((m) => (m.key === mealKey ? { ...m, ...patch } : m)),
    }));
  }

  function addMeal() {
    setDraft((prev) => {
      const nextOrder = prev.meals.length + 1;
      return {
        ...prev,
        meals: [
          ...prev.meals,
          makeDraftMeal(
            { id: `meal-${nextOrder}`, name: `Meal ${nextOrder}` },
            nextOrder,
          ),
        ],
      };
    });
  }

  function removeMeal(mealKey: string) {
    setDraft((prev) => ({
      ...prev,
      meals: prev.meals
        .filter((m) => m.key !== mealKey)
        .map((m, idx) => ({ ...m, order: idx + 1 })),
    }));
  }

  function addOption(mealKey: string) {
    setDraft((prev) => ({
      ...prev,
      meals: prev.meals.map((m) =>
        m.key === mealKey ? { ...m, options: [...m.options, makeDraftOption()] } : m,
      ),
    }));
  }

  function removeOption(mealKey: string, optKey: string) {
    setDraft((prev) => ({
      ...prev,
      meals: prev.meals.map((m) =>
        m.key === mealKey
          ? { ...m, options: m.options.filter((o) => o.key !== optKey) }
          : m,
      ),
    }));
  }

  function updateOption(mealKey: string, optKey: string, patch: Partial<DraftOption>) {
    setDraft((prev) => ({
      ...prev,
      meals: prev.meals.map((m) =>
        m.key === mealKey
          ? {
              ...m,
              options: m.options.map((o) => (o.key === optKey ? { ...o, ...patch } : o)),
            }
          : m,
      ),
    }));
  }

  function addIngredient(mealKey: string, optKey: string) {
    setDraft((prev) => ({
      ...prev,
      meals: prev.meals.map((m) =>
        m.key === mealKey
          ? {
              ...m,
              options: m.options.map((o) =>
                o.key === optKey
                  ? { ...o, ingredients: [...o.ingredients, makeDraftIngredient()] }
                  : o,
              ),
            }
          : m,
      ),
    }));
  }

  function updateIngredient(
    mealKey: string,
    optKey: string,
    ingKey: string,
    patch: Partial<DraftIngredient>,
  ) {
    setDraft((prev) => ({
      ...prev,
      meals: prev.meals.map((m) =>
        m.key === mealKey
          ? {
              ...m,
              options: m.options.map((o) =>
                o.key === optKey
                  ? {
                      ...o,
                      ingredients: o.ingredients.map((ing) =>
                        ing.key === ingKey ? { ...ing, ...patch } : ing,
                      ),
                    }
                  : o,
              ),
            }
          : m,
      ),
    }));
  }

  function removeIngredient(mealKey: string, optKey: string, ingKey: string) {
    setDraft((prev) => ({
      ...prev,
      meals: prev.meals.map((m) =>
        m.key === mealKey
          ? {
              ...m,
              options: m.options.map((o) =>
                o.key === optKey
                  ? { ...o, ingredients: o.ingredients.filter((ing) => ing.key !== ingKey) }
                  : o,
              ),
            }
          : m,
      ),
    }));
  }

  // ─── TDEE helper ──────────────────────────────────────────────────────────
  //
  // We link out to the onboarding wizard for a full TDEE flow. If the user
  // wants a quick inline estimate we use 10 × weight-in-lbs as a floor (this
  // is a common bodybuilding rule-of-thumb for maintenance). No round-trip
  // needed; just fill the kcal field.
  function inlineEstimate() {
    const lbs = window.prompt('Your bodyweight in lbs?');
    if (!lbs) return;
    const n = Number(lbs);
    if (!Number.isFinite(n) || n <= 0) return;
    // Rough maintenance = weight-lbs × 14 (sedentary→moderate midpoint).
    const est = Math.round(n * 14);
    updateDraft({ kcal: String(est) });
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setValidationError(null);
    if (saving) return;

    // Client-side gates that match the server's zod validation.
    if (!draft.name.trim()) {
      setValidationError('Give the plan a name.');
      return;
    }
    if (kcalNum <= 0) {
      setValidationError('Target kcal must be greater than 0.');
      return;
    }
    if (draft.meals.length === 0) {
      setValidationError('Add at least one meal.');
      return;
    }
    for (const meal of draft.meals) {
      if (meal.options.length === 0) {
        setValidationError(`Meal "${meal.name}" needs at least one option.`);
        return;
      }
      for (const opt of meal.options) {
        if (opt.ingredients.length === 0) {
          setValidationError(`An option in "${meal.name}" needs at least one ingredient.`);
          return;
        }
        for (const ing of opt.ingredients) {
          if (!ing.name.trim()) {
            setValidationError(`Every ingredient needs a name (in "${meal.name}").`);
            return;
          }
          if (!ing.free) {
            const q = Number(ing.quantity);
            if (!Number.isFinite(q) || q <= 0) {
              setValidationError(
                `"${ing.name}" in "${meal.name}" needs a positive quantity (or mark it FREE).`,
              );
              return;
            }
          }
        }
      }
    }

    // Assemble the MealPlanInsert payload.
    const perMealKcal = Math.round(kcalNum / draft.meals.length);
    const perMealMacros = {
      p: Math.round(macros.p / draft.meals.length),
      c: Math.round(macros.c / draft.meals.length),
      f: Math.round(macros.f / draft.meals.length),
    };

    // Parse rules — try JSON first (round-trip case). Else stash the raw text
    // into a rules.notes-ish structure. Since we only have structured rules
    // in the schema, if the text is not JSON we fold it into
    // `weighing.note_en` (the closest "generic notes" slot the schema has).
    let rulesObj: Record<string, unknown> | undefined;
    const rulesTrim = draft.rules.trim();
    if (rulesTrim.length > 0) {
      try {
        rulesObj = JSON.parse(rulesTrim);
      } catch {
        rulesObj = {
          weighing: {
            state: 'either',
            note_en: rulesTrim.slice(0, 1000),
          },
        };
      }
    }

    const payload: MealPlanInsert = {
      name: draft.name.trim(),
      schema_version: '1.0',
      parsing_notes: isEdit ? [] : ['Created via PLAN form (v0.5.2).'],
      plan: {
        goal_en: `Target ${kcalNum} kcal / day`,
        meals_per_day: draft.meals.length,
        daily_targets: {
          calories_kcal: kcalNum,
          protein_g: macros.p,
          carbs_g: macros.c,
          fat_g: macros.f,
        },
        rules: rulesObj as MealPlan['plan']['rules'],
        meals: draft.meals.map((m) => ({
          id: m.id,
          name_en: m.name,
          order: m.order,
          targets: {
            protein_g: perMealMacros.p,
            carbs_g: perMealMacros.c,
            fat_g: perMealMacros.f,
            calories_kcal: perMealKcal,
          },
          options: m.options.map((o, i) => ({
            option: i + 1,
            dish_en: o.dish.trim() || undefined,
            ingredients: o.ingredients.map((ing) => ({
              name_en: ing.name.trim(),
              quantity: ing.free ? null : Number(ing.quantity),
              unit: ing.free ? null : ing.unit,
              free: ing.free ? true : undefined,
            })),
          })),
        })),
      },
    };

    setSaving(true);
    try {
      const url = isEdit
        ? `/api/mini-apps/calorie-lite/meal-plans/${initial!.id!}`
        : '/api/mini-apps/calorie-lite/meal-plans';
      const method = isEdit ? 'PATCH' : 'POST';
      // PATCH accepts { name, plan } — POST accepts the full insert schema.
      const body = isEdit
        ? { name: payload.name, plan: payload.plan }
        : payload;
      const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        onError(
          errBody?.error === 'invalid_body'
            ? 'Plan is invalid — check your inputs.'
            : 'Could not save plan.',
        );
        setSaving(false);
        return;
      }
      const parsed = (await res.json()) as { meal_plan?: { id: string } };
      const savedId = parsed.meal_plan?.id ?? initial?.id;
      if (!savedId) {
        onError('Save succeeded but response was missing an id.');
        setSaving(false);
        return;
      }
      onSaved(savedId);
    } catch {
      onError('Network error while saving.');
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Back rail — mono, tracked. Matches the DETAIL back rail style. */}
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        aria-label="Cancel and go back"
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
        <span aria-hidden>{'← Cancel'}</span>
        <span aria-hidden>{']'}</span>
      </button>

      {/* Prescription-worksheet kicker — replaces the small "EDIT PLAN" label
          that reads as a debug tag. */}
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
          {isEdit ? 'Edit prescription' : 'New prescription'}
          <span style={{ color: 'var(--color-text-disabled)' }}>
            {'  ·  '}
            {isEdit ? 'revising' : 'step 01'}
          </span>
        </span>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 'var(--text-heading)',
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
            color: 'var(--color-text-display)',
          }}
        >
          {isEdit ? draft.name || 'Untitled plan' : 'A fresh plan'}
        </h1>
      </div>

      {/* — NAME — */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <SectionRule label="Plan name" />
        <input
          className="input"
          type="text"
          value={draft.name}
          onChange={(e) => updateDraft({ name: e.target.value })}
          placeholder="e.g. Cutting 2100"
          autoComplete="off"
          maxLength={120}
          style={INPUT_STYLE}
        />
      </div>

      {/* — DAILY TARGETS — kcal + preset stamp bar + live macro tape preview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <SectionRule
          label="Daily targets"
          right={
            <button
              type="button"
              onClick={inlineEstimate}
              style={{
                all: 'unset',
                cursor: 'pointer',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-accent)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Calculate for me
            </button>
          }
        />

        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
            Kcal / day
          </span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={20000}
            value={draft.kcal}
            onChange={(e) => updateDraft({ kcal: e.target.value })}
            style={{ ...INPUT_STYLE, fontFamily: 'var(--font-label)', fontSize: 'var(--text-subheading)' }}
          />
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
            Macro split
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {(Object.keys(MACRO_PRESETS) as Array<keyof typeof MACRO_PRESETS>).map((preset) => (
              <PresetStamp
                key={preset}
                active={draft.preset === preset}
                onClick={() => updateDraft({ preset })}
              >
                {MACRO_PRESETS[preset].label}
              </PresetStamp>
            ))}
            <PresetStamp
              active={draft.preset === 'custom'}
              onClick={() => updateDraft({ preset: 'custom' })}
            >
              CUSTOM
            </PresetStamp>
          </div>
        </div>

        {/* Live tape preview — same visual language as the detail header. */}
        <div style={{ marginTop: 'var(--space-2)' }}>
          <MacroTape
            cells={[
              { label: 'KCAL', value: kcalNum },
              { label: 'P', value: macros.p, suffix: 'g' },
              { label: 'C', value: macros.c, suffix: 'g' },
              { label: 'F', value: macros.f, suffix: 'g' },
            ]}
            size="sm"
            animate={false}
          />
        </div>

        {draft.preset === 'custom' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
            }}
          >
            {[
              { label: 'PROTEIN g', v: draft.customP, set: (v: string) => updateDraft({ customP: v }) },
              { label: 'CARBS g',   v: draft.customC, set: (v: string) => updateDraft({ customC: v }) },
              { label: 'FAT g',     v: draft.customF, set: (v: string) => updateDraft({ customF: v }) },
            ].map((f) => (
              <label
                key={f.label}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
              >
                <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
                  {f.label}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={f.v}
                  onChange={(e) => f.set(e.target.value)}
                  style={INPUT_STYLE}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* — MEALS — */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <SectionRule
          label={`Meals · ${String(draft.meals.length).padStart(2, '0')}`}
          right={
            <button
              type="button"
              onClick={addMeal}
              style={ADD_CHIP_STYLE}
            >
              + ADD MEAL
            </button>
          }
        />

        {draft.meals.map((meal) => (
          <MealEditor
            key={meal.key}
            meal={meal}
            onChange={(patch) => updateMeal(meal.key, patch)}
            onRemove={() => removeMeal(meal.key)}
            onAddOption={() => addOption(meal.key)}
            onRemoveOption={(k) => removeOption(meal.key, k)}
            onUpdateOption={(k, patch) => updateOption(meal.key, k, patch)}
            onAddIngredient={(k) => addIngredient(meal.key, k)}
            onUpdateIngredient={(oKey, iKey, patch) =>
              updateIngredient(meal.key, oKey, iKey, patch)
            }
            onRemoveIngredient={(oKey, iKey) =>
              removeIngredient(meal.key, oKey, iKey)
            }
          />
        ))}
      </div>

      {/* — RULES — */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <SectionRule
          label="Rules"
          right={
            <span
              style={{
                fontFamily: 'var(--font-label)',
                fontSize: '10px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-disabled)',
              }}
            >
              Optional · max 2000
            </span>
          }
        />
        <textarea
          value={draft.rules}
          onChange={(e) => updateDraft({ rules: e.target.value.slice(0, 2000) })}
          placeholder="e.g. Weigh everything raw. Vegetables unlimited at lunch + dinner."
          rows={4}
          style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: 80 }}
        />
      </div>

      {validationError && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {validationError}
        </p>
      )}

      {/* Sticky-ish save row (bottom of scrolling form; we don't fix-position
          it because the mini-app tab bar already reserves the true bottom). */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'center',
          paddingTop: 'var(--space-4)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saving ? 'var(--color-surface-raised)' : 'var(--color-accent)',
            color: saving ? 'var(--color-text-disabled)' : 'var(--color-text-display)',
            border: 0,
            borderRadius: 'var(--radius-button)',
            padding: 'var(--space-3) var(--space-6)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save plan'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn btn-ghost"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Meal editor ────────────────────────────────────────────────────────────

function MealEditor({
  meal,
  onChange,
  onRemove,
  onAddOption,
  onRemoveOption,
  onUpdateOption,
  onAddIngredient,
  onUpdateIngredient,
  onRemoveIngredient,
}: {
  meal: DraftMeal;
  onChange: (patch: Partial<DraftMeal>) => void;
  onRemove: () => void;
  onAddOption: () => void;
  onRemoveOption: (optKey: string) => void;
  onUpdateOption: (optKey: string, patch: Partial<DraftOption>) => void;
  onAddIngredient: (optKey: string) => void;
  onUpdateIngredient: (optKey: string, ingKey: string, patch: Partial<DraftIngredient>) => void;
  onRemoveIngredient: (optKey: string, ingKey: string) => void;
}) {
  return (
    <section
      aria-label={`Meal ${meal.name}`}
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <span
          className="data"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
          }}
        >
          {String(meal.order).padStart(2, '0')} · MEAL
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="btn btn-ghost"
          aria-label={`Remove meal ${meal.name}`}
          style={{
            padding: 'var(--space-1) var(--space-3)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-disabled)',
          }}
        >
          × Remove
        </button>
      </div>
      <input
        type="text"
        value={meal.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Meal name"
        style={{ ...INPUT_STYLE, fontSize: 'var(--text-body)' }}
      />

      {meal.options.map((opt, idx) => (
        <div
          key={opt.key}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span
              className="label"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              OPTION {idx + 1}
            </span>
            {meal.options.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveOption(opt.key)}
                className="btn btn-ghost"
                style={{
                  padding: 'var(--space-1) var(--space-2)',
                  fontSize: 'var(--text-caption)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-disabled)',
                }}
              >
                × Remove option
              </button>
            )}
          </div>
          <input
            type="text"
            value={opt.dish}
            onChange={(e) => onUpdateOption(opt.key, { dish: e.target.value })}
            placeholder="Dish name (optional) — e.g. Chicken bowl"
            style={INPUT_STYLE}
          />

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
            {opt.ingredients.map((ing) => (
              <li key={ing.key}>
                <IngredientRowEditor
                  ing={ing}
                  onChange={(patch) => onUpdateIngredient(opt.key, ing.key, patch)}
                  onRemove={() =>
                    opt.ingredients.length > 1
                      ? onRemoveIngredient(opt.key, ing.key)
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => onAddIngredient(opt.key)}
            className="data"
            style={{ ...ADD_CHIP_STYLE, alignSelf: 'flex-start' }}
          >
            + ADD INGREDIENT
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={onAddOption}
        className="data"
        style={{
          ...ADD_CHIP_STYLE,
          alignSelf: 'flex-start',
          marginTop: 'var(--space-2)',
        }}
      >
        + ADD OPTION
      </button>
    </section>
  );
}

function IngredientRowEditor({
  ing,
  onChange,
  onRemove,
}: {
  ing: DraftIngredient;
  onChange: (patch: Partial<DraftIngredient>) => void;
  onRemove?: () => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 68px auto auto',
        gap: 'var(--space-2)',
        alignItems: 'center',
      }}
    >
      <input
        type="text"
        value={ing.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Ingredient"
        style={{ ...INPUT_STYLE, minWidth: 0 }}
      />
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.1}
        value={ing.quantity}
        onChange={(e) => onChange({ quantity: e.target.value })}
        placeholder="qty"
        disabled={ing.free}
        style={{ ...INPUT_STYLE, minWidth: 0, opacity: ing.free ? 0.4 : 1 }}
      />
      <select
        value={ing.unit}
        onChange={(e) => onChange({ unit: e.target.value as DraftIngredient['unit'] })}
        disabled={ing.free}
        style={{ ...INPUT_STYLE, minWidth: 0, opacity: ing.free ? 0.4 : 1 }}
      >
        <option value="g">g</option>
        <option value="ml">ml</option>
        <option value="unit">unit</option>
      </select>
      <button
        type="button"
        onClick={() => onChange({ free: !ing.free })}
        aria-pressed={ing.free}
        title={ing.free ? 'Free / unlimited item' : 'Mark as free / unlimited'}
        style={{
          background: ing.free ? 'var(--color-accent-subtle)' : 'transparent',
          color: ing.free ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
          border: `1px solid ${ing.free ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
          borderRadius: 'var(--radius-compact)',
          padding: 'var(--space-2) var(--space-3)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-caption)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        FREE
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove ingredient"
        disabled={onRemove == null}
        className="btn btn-ghost"
        style={{
          padding: 'var(--space-2) var(--space-2)',
          fontSize: 'var(--text-body)',
          color: 'var(--color-text-disabled)',
          cursor: onRemove ? 'pointer' : 'not-allowed',
          opacity: onRemove ? 1 : 0.3,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Primitives ─────────────────────────────────────────────────────────────

/** PresetStamp — flat mono-typed stamp with 1px hairline, filled ember-red
 *  when active. Reads like a rubber stamp in the worksheet, not a pill.
 *  (v0.5.3 rename from PresetChip; visual switched from rounded-subtle to
 *  a filled-red-block active state.) */
function PresetStamp({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: active ? 'var(--color-accent)' : 'transparent',
        color: active ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
        borderRadius: '2px',
        padding: 'var(--space-2) var(--space-3)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const INPUT_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.4)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-compact)',
  padding: 'var(--space-2) var(--space-3)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  width: '100%',
};

/** Add-something chip — mono, hairline border, ember-red text. Loud enough
 *  to be found; quiet enough not to compete with the primary Save CTA. */
const ADD_CHIP_STYLE: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--color-accent)',
  border: '1px solid var(--color-accent)',
  borderRadius: '2px',
  padding: '2px var(--space-2)',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};
