'use client';

/**
 * Calorie Lite — per-mini-app settings panel.
 *
 * Everything that used to live under the "Preferences" section of the main
 * app Settings surface now lives here:
 *
 *   1. Nutrition goals   — daily kcal, macro split (P/C/F %), water, weight
 *   2. Unit preferences  — weight (kg / lb), volume (ml / oz)
 *   3. Body profile      — sex, age, height, activity level, goal direction
 *   4. Redo onboarding   — cadmium ghost button that re-opens the wizard
 *
 * All fields patch `/api/preferences` on Save. Validation matches the
 * onboarding wizard: macro percentages must sum to 100, calorie floor
 * warning at 1200 kcal.
 *
 * Rendered inside the shared MiniAppSettingsSheet (drawer chrome, close X,
 * escape/backdrop close, body-scroll lock). The sheet passes an `onClose`
 * callback we invoke on successful save so the user immediately returns to
 * the mini-app.
 *
 * Cross-package imports: the same relative-reach pattern the mini-app
 * already uses for `useToast()`. Turbopack resolves both because the
 * `@nothing-mini-apps/calorie-lite` package is listed in
 * `transpilePackages` and the web app is on the same tsconfig path map.
 *
 * Design tokens only — no hex, no --space-5 (scale skips 5 and 7).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { usePreferences, useEvents } from '@nothing/mini-apps-runtime';
import {
  EVENT_KINDS,
  type ActivityLevel,
  type GoalDirection,
  type MacroGoalPct,
  type Sex,
} from '@nothing/shared';
// Reach into the host web app the same way OnboardingWizard already does.
// Turbopack + the workspace tsconfig resolve this at compile-time.
import { useToast } from '../../web/src/lib/toast/context';
import { MacroGoalEditor } from '../../web/src/components/settings/MacroGoalEditor';

// ─── constants ────────────────────────────────────────────────────────────

const DEFAULT_MACRO_GOAL: MacroGoalPct = { protein: 30, carbs: 40, fat: 30 };
const DEFAULT_WATER_GOAL_ML = 2500;
const DEFAULT_DAILY_GOAL_KCAL = 2000;
/** Recommended minimum daily intake; below this we warn but don't block. */
const CALORIE_FLOOR_KCAL = 1200;

/**
 * Custom DOM event the mini-app page listens for to re-open the onboarding
 * wizard. Exported so both sides use the same string — one source of truth.
 */
export const REOPEN_ONBOARDING_EVENT = 'calorie-lite:reopen-onboarding';

const SEX_OPTIONS: { id: Sex; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other', label: 'Other' },
];

const GOAL_OPTIONS: { id: GoalDirection; label: string }[] = [
  { id: 'lose', label: 'Lose' },
  { id: 'maintain', label: 'Maintain' },
  { id: 'gain', label: 'Gain' },
];

const ACTIVITY_OPTIONS: { id: ActivityLevel; label: string }[] = [
  { id: 'sedentary', label: 'Sedentary' },
  { id: 'light', label: 'Light' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'active', label: 'Active' },
  { id: 'very_active', label: 'Very active' },
];

// ─── shared inline styles ─────────────────────────────────────────────────

const SECTION_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.5)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const SECTION_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

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

const PRIMARY_BTN_STYLE: CSSProperties = {
  padding: 'var(--space-3) var(--space-6)',
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  border: 'none',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-label)',
  fontWeight: 500,
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: '44px',
  transition: 'opacity var(--dur-fast) var(--ease-out)',
};

const SECONDARY_BTN_STYLE: CSSProperties = {
  padding: 'var(--space-3) var(--space-6)',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-label)',
  fontWeight: 500,
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: '44px',
};

const GHOST_ACCENT_BTN_STYLE: CSSProperties = {
  ...SECONDARY_BTN_STYLE,
  color: 'var(--color-accent)',
  borderColor: 'var(--color-accent)',
};

// ─── helpers ──────────────────────────────────────────────────────────────

function mlToCups(ml: number): number {
  if (!Number.isFinite(ml) || ml <= 0) return 0;
  return Math.round((ml / 250) * 10) / 10;
}

function kgToLb(kg: number): number {
  if (!Number.isFinite(kg) || kg <= 0) return 0;
  return Math.round(kg * 2.20462 * 10) / 10;
}

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

// ─── component ────────────────────────────────────────────────────────────

export default function CalorieLiteSettings({
  onClose,
}: {
  onClose: () => void;
}) {
  const preferences = usePreferences();
  const events = useEvents();
  const { toast } = useToast();

  // Nutrition goals
  const [calorieTarget, setCalorieTarget] = useState<number>(
    preferences.daily_calorie_goal ?? DEFAULT_DAILY_GOAL_KCAL,
  );
  const [macroGoal, setMacroGoal] = useState<MacroGoalPct>(DEFAULT_MACRO_GOAL);
  const [waterGoalMl, setWaterGoalMl] = useState<number>(
    preferences.water_goal_ml ?? DEFAULT_WATER_GOAL_ML,
  );
  const [weightGoalKg, setWeightGoalKg] = useState<string>(
    preferences.weight_goal_kg != null ? String(preferences.weight_goal_kg) : '',
  );

  // Unit preferences
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>(
    preferences.weight_unit ?? 'kg',
  );
  const [volumeUnit, setVolumeUnit] = useState<'ml' | 'oz'>(
    preferences.volume_unit ?? 'ml',
  );

  // Body profile — same fields as OnboardingWizard's BODY step, flattened.
  const [sex, setSex] = useState<Sex | null>(preferences.sex ?? null);
  const [age, setAge] = useState<string>(
    preferences.age_years != null ? String(preferences.age_years) : '',
  );
  const [heightCm, setHeightCm] = useState<string>(
    preferences.height_cm != null ? String(preferences.height_cm) : '',
  );
  const [activity, setActivity] = useState<ActivityLevel | null>(
    preferences.activity_level ?? null,
  );
  const [goal, setGoal] = useState<GoalDirection | null>(
    preferences.goal_direction ?? null,
  );

  // Load current macro_goal_pct from the server since it isn't on the
  // shared runtime context yet. Fire once on mount and hydrate the field.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/preferences', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          preferences: {
            macro_goal_pct?: MacroGoalPct | null;
          } | null;
        };
        if (cancelled) return;
        const mg = body.preferences?.macro_goal_pct;
        if (
          mg &&
          typeof mg.protein === 'number' &&
          typeof mg.carbs === 'number' &&
          typeof mg.fat === 'number'
        ) {
          setMacroGoal({ protein: mg.protein, carbs: mg.carbs, fat: mg.fat });
        }
      } catch {
        // Silent — the form is usable with the default macro split.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const macroSum = macroGoal.protein + macroGoal.carbs + macroGoal.fat;
  const macroIsValid = Math.abs(macroSum - 100) < 0.5;
  const belowFloor =
    Number.isFinite(calorieTarget) && calorieTarget > 0 && calorieTarget < CALORIE_FLOOR_KCAL;

  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  const dirtyTouch = useCallback(() => {
    setStatus((prev) => (prev.kind === 'idle' ? prev : { kind: 'idle' }));
  }, []);

  const save = useCallback(
    async (evt: FormEvent<HTMLFormElement>) => {
      evt.preventDefault();
      if (!macroIsValid) {
        setStatus({ kind: 'error', message: 'Macro split must sum to 100.' });
        return;
      }
      setStatus({ kind: 'saving' });
      try {
        const trimmedWeight = weightGoalKg.trim();
        const weightGoalNum = trimmedWeight === '' ? null : Number(trimmedWeight);
        const weightGoalPayload =
          weightGoalNum === null
            ? null
            : Number.isFinite(weightGoalNum) && weightGoalNum > 0
              ? weightGoalNum
              : undefined;

        const ageNum = age.trim() === '' ? null : Number(age);
        const heightNum = heightCm.trim() === '' ? null : Number(heightCm);

        const payload: Record<string, unknown> = {
          daily_calorie_goal: Number.isFinite(calorieTarget) ? calorieTarget : DEFAULT_DAILY_GOAL_KCAL,
          macro_goal_pct: macroGoal,
          water_goal_ml:
            Number.isFinite(waterGoalMl) && waterGoalMl > 0
              ? waterGoalMl
              : DEFAULT_WATER_GOAL_ML,
          weight_unit: weightUnit,
          volume_unit: volumeUnit,
          sex,
          age_years:
            ageNum == null ? null : Number.isFinite(ageNum) && ageNum > 0 ? Math.round(ageNum) : null,
          height_cm:
            heightNum == null
              ? null
              : Number.isFinite(heightNum) && heightNum > 0
                ? heightNum
                : null,
          activity_level: activity,
          goal_direction: goal,
        };
        if (weightGoalPayload !== undefined) {
          payload.weight_goal_kg = weightGoalPayload;
        }

        const res = await fetch('/api/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          const errMsg = body.error ?? 'save_failed';
          if (res.status >= 500) {
            toast.error("Something broke on our end. We're logging it.");
          } else if (res.status === 400) {
            toast.error(`Nutrition — ${errMsg}`);
          } else if (res.status !== 401) {
            toast.error(errMsg);
          }
          throw new Error(errMsg);
        }
        setStatus({ kind: 'saved' });
        toast.info('Nutrition settings saved.');
        // Broadcast so the mini-app + other tabs rehydrate immediately.
        events.emit(EVENT_KINDS.preferences_updated, {
          at: new Date().toISOString(),
        });
        // Give the toast a beat, then close the sheet.
        setTimeout(() => onClose(), 400);
      } catch (err) {
        if (err instanceof TypeError) {
          toast.error("Can't reach the server. Check your connection.");
        }
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'save_failed',
        });
      }
    },
    [
      activity,
      age,
      calorieTarget,
      events,
      goal,
      heightCm,
      macroGoal,
      macroIsValid,
      onClose,
      sex,
      toast,
      volumeUnit,
      waterGoalMl,
      weightGoalKg,
      weightUnit,
    ],
  );

  const redoOnboarding = useCallback(() => {
    // Close the sheet first so the wizard's overlay has a clean stack.
    onClose();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(REOPEN_ONBOARDING_EVENT));
    }
  }, [onClose]);

  const weightLbHint = useMemo(() => {
    const n = Number(weightGoalKg);
    if (!Number.isFinite(n) || n <= 0) return null;
    return weightUnit === 'lb' ? `≈ ${kgToLb(n)} lb` : null;
  }, [weightGoalKg, weightUnit]);

  return (
    <form
      onSubmit={save}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
    >
      {/* ── 01 · NUTRITION GOALS ────────────────────────────────────────── */}
      <section aria-labelledby="cl-settings-nutrition" style={SECTION_STYLE}>
        <h3 id="cl-settings-nutrition" style={SECTION_TITLE_STYLE}>
          01 · Nutrition goals
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label htmlFor="cl-cal-target" style={FIELD_LABEL_STYLE}>
            Daily calorie target
          </label>
          <input
            id="cl-cal-target"
            type="number"
            inputMode="numeric"
            min={500}
            max={10000}
            step={50}
            value={calorieTarget}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              setCalorieTarget(Number.isFinite(next) ? next : 0);
              dirtyTouch();
            }}
            disabled={status.kind === 'saving'}
            style={INPUT_STYLE}
          />
          {belowFloor && (
            <p style={{ ...HINT_STYLE, color: 'var(--color-accent)' }}>
              Below the 1,200 kcal floor — most people should not eat this little.
            </p>
          )}
        </div>

        <MacroGoalEditor
          value={macroGoal}
          calorieTarget={calorieTarget}
          disabled={status.kind === 'saving'}
          onChange={setMacroGoal}
          onEdit={dirtyTouch}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label htmlFor="cl-water-goal" style={FIELD_LABEL_STYLE}>
            Water goal (ml)
          </label>
          <input
            id="cl-water-goal"
            type="number"
            inputMode="numeric"
            min={250}
            max={10000}
            step={250}
            value={waterGoalMl}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              setWaterGoalMl(Number.isFinite(next) ? next : 0);
              dirtyTouch();
            }}
            disabled={status.kind === 'saving'}
            style={INPUT_STYLE}
          />
          <p style={HINT_STYLE}>≈ {mlToCups(waterGoalMl)} cups (250 ml each)</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label htmlFor="cl-weight-goal" style={FIELD_LABEL_STYLE}>
            Weight goal (kg) — optional
          </label>
          <input
            id="cl-weight-goal"
            type="number"
            inputMode="decimal"
            min={20}
            max={400}
            step={0.5}
            value={weightGoalKg}
            placeholder="e.g. 72"
            onChange={(e) => {
              setWeightGoalKg(e.target.value);
              dirtyTouch();
            }}
            disabled={status.kind === 'saving'}
            style={INPUT_STYLE}
          />
          <p style={HINT_STYLE}>
            {weightLbHint ?? `Leave blank to clear. Displayed in ${weightUnit}.`}
          </p>
        </div>
      </section>

      {/* ── 02 · UNIT PREFERENCES ───────────────────────────────────────── */}
      <section aria-labelledby="cl-settings-units" style={SECTION_STYLE}>
        <h3 id="cl-settings-units" style={SECTION_TITLE_STYLE}>
          02 · Unit preferences
        </h3>

        <UnitPill
          label="Weight unit"
          options={[
            { id: 'kg', label: 'KG' },
            { id: 'lb', label: 'LB' },
          ]}
          value={weightUnit}
          onChange={(v) => {
            setWeightUnit(v);
            dirtyTouch();
          }}
          disabled={status.kind === 'saving'}
        />

        <UnitPill
          label="Volume unit"
          options={[
            { id: 'ml', label: 'ML' },
            { id: 'oz', label: 'OZ' },
          ]}
          value={volumeUnit}
          onChange={(v) => {
            setVolumeUnit(v);
            dirtyTouch();
          }}
          disabled={status.kind === 'saving'}
        />
      </section>

      {/* ── 03 · BODY PROFILE ───────────────────────────────────────────── */}
      <section aria-labelledby="cl-settings-body" style={SECTION_STYLE}>
        <h3 id="cl-settings-body" style={SECTION_TITLE_STYLE}>
          03 · Body profile
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={FIELD_LABEL_STYLE}>Sex</span>
          <div
            role="radiogroup"
            aria-label="Sex"
            style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
          >
            {SEX_OPTIONS.map((opt) => {
              const active = sex === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setSex(opt.id);
                    dirtyTouch();
                  }}
                  disabled={status.kind === 'saving'}
                  style={{
                    flex: '1 1 auto',
                    background: active ? 'var(--color-accent)' : 'transparent',
                    color: active
                      ? 'var(--color-text-display)'
                      : 'var(--color-text-primary)',
                    border: `1px solid ${
                      active
                        ? 'var(--color-accent)'
                        : 'var(--color-border-visible)'
                    }`,
                    borderRadius: 'var(--radius-button)',
                    padding: 'var(--space-2) var(--space-4)',
                    fontFamily: 'var(--font-label)',
                    fontSize: 'var(--text-label)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: status.kind === 'saving' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label htmlFor="cl-age" style={FIELD_LABEL_STYLE}>
            Age (years)
          </label>
          <input
            id="cl-age"
            type="number"
            inputMode="numeric"
            min={1}
            max={129}
            value={age}
            onChange={(e) => {
              setAge(e.target.value);
              dirtyTouch();
            }}
            disabled={status.kind === 'saving'}
            placeholder="30"
            style={INPUT_STYLE}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label htmlFor="cl-height" style={FIELD_LABEL_STYLE}>
            Height (cm)
          </label>
          <input
            id="cl-height"
            type="number"
            inputMode="numeric"
            min={51}
            max={259}
            step={0.5}
            value={heightCm}
            onChange={(e) => {
              setHeightCm(e.target.value);
              dirtyTouch();
            }}
            disabled={status.kind === 'saving'}
            placeholder="175"
            style={INPUT_STYLE}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={FIELD_LABEL_STYLE}>Activity level</span>
          <div
            role="radiogroup"
            aria-label="Activity level"
            style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
          >
            {ACTIVITY_OPTIONS.map((opt) => {
              const active = activity === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setActivity(opt.id);
                    dirtyTouch();
                  }}
                  disabled={status.kind === 'saving'}
                  style={{
                    background: active ? 'var(--color-accent)' : 'transparent',
                    color: active
                      ? 'var(--color-text-display)'
                      : 'var(--color-text-primary)',
                    border: `1px solid ${
                      active
                        ? 'var(--color-accent)'
                        : 'var(--color-border-visible)'
                    }`,
                    borderRadius: 'var(--radius-button)',
                    padding: 'var(--space-2) var(--space-4)',
                    fontFamily: 'var(--font-label)',
                    fontSize: 'var(--text-label)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: status.kind === 'saving' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={FIELD_LABEL_STYLE}>Goal direction</span>
          <div
            role="radiogroup"
            aria-label="Goal direction"
            style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
          >
            {GOAL_OPTIONS.map((opt) => {
              const active = goal === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setGoal(opt.id);
                    dirtyTouch();
                  }}
                  disabled={status.kind === 'saving'}
                  style={{
                    flex: '1 1 auto',
                    background: active ? 'var(--color-accent)' : 'transparent',
                    color: active
                      ? 'var(--color-text-display)'
                      : 'var(--color-text-primary)',
                    border: `1px solid ${
                      active
                        ? 'var(--color-accent)'
                        : 'var(--color-border-visible)'
                    }`,
                    borderRadius: 'var(--radius-button)',
                    padding: 'var(--space-2) var(--space-4)',
                    fontFamily: 'var(--font-label)',
                    fontSize: 'var(--text-label)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: status.kind === 'saving' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Save + status ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <button
          type="submit"
          disabled={status.kind === 'saving' || !macroIsValid}
          style={{
            ...PRIMARY_BTN_STYLE,
            opacity: status.kind === 'saving' || !macroIsValid ? 0.6 : 1,
            cursor:
              status.kind === 'saving' || !macroIsValid
                ? 'not-allowed'
                : 'pointer',
          }}
        >
          {status.kind === 'saving' ? 'Saving…' : 'Save settings'}
        </button>
        {status.kind === 'saved' && (
          <p role="status" style={HINT_STYLE}>
            Saved.
          </p>
        )}
        {status.kind === 'error' && (
          <p role="alert" style={{ ...HINT_STYLE, color: 'var(--color-accent)' }}>
            Couldn&apos;t save — {status.message}
          </p>
        )}
      </div>

      {/* ── Redo onboarding ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={redoOnboarding}
        disabled={status.kind === 'saving'}
        style={GHOST_ACCENT_BTN_STYLE}
      >
        Redo onboarding
      </button>
    </form>
  );
}

// ─── UnitPill — small kg/lb + ml/oz selector ──────────────────────────────

function UnitPill<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span style={FIELD_LABEL_STYLE}>{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        style={{ display: 'inline-flex', gap: 'var(--space-2)' }}
      >
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.id)}
              disabled={disabled}
              style={{
                background: active ? 'var(--color-accent)' : 'transparent',
                color: active
                  ? 'var(--color-text-display)'
                  : 'var(--color-text-primary)',
                border: `1px solid ${
                  active ? 'var(--color-accent)' : 'var(--color-border-visible)'
                }`,
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-2) var(--space-4)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: disabled ? 'not-allowed' : 'pointer',
                minWidth: 56,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
