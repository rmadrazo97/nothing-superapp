'use client';

/**
 * Calorie Lite — per-mini-app settings panel.
 *
 * Refactored (v0.5.2) to use the shared mini-app settings framework at
 * apps/web/src/components/mini-app-settings. Behaviour is unchanged:
 *
 *   SECTION 01 · NUTRITION GOALS   — kcal, macro split, water, weight goal
 *   SECTION 02 · UNIT PREFERENCES  — weight (kg/lb), volume (ml/oz)
 *   SECTION 03 · BODY PROFILE      — sex, age, height, activity, goal dir
 *   Redo onboarding                — cadmium ghost button
 *
 * Storage still targets `/api/preferences` (not the new
 * `mini_app_settings` table) because these fields are cross-cutting user
 * biometrics used by the copilot + meal plan generator, not calorie-only.
 * Only the presentation moved to the framework — nothing on the wire
 * changed, so no migration is needed.
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
import { useToast } from '../../web/src/lib/toast/context';
import { MacroGoalEditor } from '../../web/src/components/settings/MacroGoalEditor';
import {
  MiniAppSettingsPanel,
  SettingsSection,
  SettingsField,
  SettingsSelect,
  SettingsButton,
  INPUT_STYLE,
  FIELD_HELPER_STYLE,
} from '../../web/src/components/mini-app-settings';

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

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const GOAL_OPTIONS: { value: GoalDirection; label: string }[] = [
  { value: 'lose', label: 'Lose' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain' },
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];

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

const HELPER_ACCENT_STYLE: CSSProperties = {
  ...FIELD_HELPER_STYLE,
  color: 'var(--color-accent)',
};

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
        events.emit(EVENT_KINDS.preferences_updated, {
          at: new Date().toISOString(),
        });
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

  const saving = status.kind === 'saving';

  return (
    <form onSubmit={save} style={{ display: 'block' }}>
      <MiniAppSettingsPanel name="Fitness Pal" onBack={onClose}>
        {/* ── 01 · NUTRITION GOALS ─────────────────────────────────── */}
        <SettingsSection number={1} title="Nutrition goals">
          <SettingsField label="Daily calorie target" htmlFor="cl-cal-target">
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
              disabled={saving}
              style={INPUT_STYLE}
            />
            {belowFloor && (
              <p style={HELPER_ACCENT_STYLE}>
                Below the 1,200 kcal floor — most people should not eat this
                little.
              </p>
            )}
          </SettingsField>

          <MacroGoalEditor
            value={macroGoal}
            calorieTarget={calorieTarget}
            disabled={saving}
            onChange={setMacroGoal}
            onEdit={dirtyTouch}
          />

          <SettingsField
            label="Water goal (ml)"
            htmlFor="cl-water-goal"
            helper={`≈ ${mlToCups(waterGoalMl)} cups (250 ml each)`}
          >
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
              disabled={saving}
              style={INPUT_STYLE}
            />
          </SettingsField>

          <SettingsField
            label="Weight goal (kg) — optional"
            htmlFor="cl-weight-goal"
            helper={
              weightLbHint ?? `Leave blank to clear. Displayed in ${weightUnit}.`
            }
          >
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
              disabled={saving}
              style={INPUT_STYLE}
            />
          </SettingsField>
        </SettingsSection>

        {/* ── 02 · UNIT PREFERENCES ────────────────────────────────── */}
        <SettingsSection number={2} title="Unit preferences">
          <SettingsField label="Weight unit">
            <SettingsSelect<'kg' | 'lb'>
              ariaLabel="Weight unit"
              value={weightUnit}
              disabled={saving}
              onChange={(v) => {
                setWeightUnit(v);
                dirtyTouch();
              }}
              options={[
                { value: 'kg', label: 'KG' },
                { value: 'lb', label: 'LB' },
              ]}
            />
          </SettingsField>

          <SettingsField label="Volume unit">
            <SettingsSelect<'ml' | 'oz'>
              ariaLabel="Volume unit"
              value={volumeUnit}
              disabled={saving}
              onChange={(v) => {
                setVolumeUnit(v);
                dirtyTouch();
              }}
              options={[
                { value: 'ml', label: 'ML' },
                { value: 'oz', label: 'OZ' },
              ]}
            />
          </SettingsField>
        </SettingsSection>

        {/* ── 03 · BODY PROFILE ────────────────────────────────────── */}
        <SettingsSection number={3} title="Body profile">
          <SettingsField label="Sex">
            <SettingsSelect<Sex>
              ariaLabel="Sex"
              value={(sex ?? 'other') as Sex}
              disabled={saving}
              onChange={(v) => {
                setSex(v);
                dirtyTouch();
              }}
              options={SEX_OPTIONS}
            />
          </SettingsField>

          <SettingsField label="Age (years)" htmlFor="cl-age">
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
              disabled={saving}
              placeholder="30"
              style={INPUT_STYLE}
            />
          </SettingsField>

          <SettingsField label="Height (cm)" htmlFor="cl-height">
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
              disabled={saving}
              placeholder="175"
              style={INPUT_STYLE}
            />
          </SettingsField>

          <SettingsField label="Activity level">
            <SettingsSelect<ActivityLevel>
              ariaLabel="Activity level"
              value={(activity ?? 'moderate') as ActivityLevel}
              disabled={saving}
              onChange={(v) => {
                setActivity(v);
                dirtyTouch();
              }}
              options={ACTIVITY_OPTIONS}
            />
          </SettingsField>

          <SettingsField label="Goal direction">
            <SettingsSelect<GoalDirection>
              ariaLabel="Goal direction"
              value={(goal ?? 'maintain') as GoalDirection}
              disabled={saving}
              onChange={(v) => {
                setGoal(v);
                dirtyTouch();
              }}
              options={GOAL_OPTIONS}
            />
          </SettingsField>
        </SettingsSection>

        {/* ── Save + status ───────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <SettingsButton
            type="submit"
            variant="primary"
            disabled={saving || !macroIsValid}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </SettingsButton>
          {status.kind === 'saved' && (
            <p role="status" style={FIELD_HELPER_STYLE}>
              Saved.
            </p>
          )}
          {status.kind === 'error' && (
            <p role="alert" style={HELPER_ACCENT_STYLE}>
              Couldn&apos;t save — {status.message}
            </p>
          )}
        </div>

        <SettingsButton
          type="button"
          variant="accent-ghost"
          onClick={redoOnboarding}
          disabled={saving}
        >
          Redo onboarding
        </SettingsButton>
      </MiniAppSettingsPanel>
    </form>
  );
}
