'use client';

/**
 * OnboardingWizard — first-run calorie-target setup for calorie-lite.
 *
 * Four steps: BODY → GOAL → ACTIVITY → CONFIRM. Full-screen dark overlay,
 * dark cards inside, cadmium red for selected pills + primary CTA. Emits
 * `preferences_updated` on save so the shell + other views can rehydrate.
 *
 * Always skippable — SKIP FOR NOW records `onboarded_at = now()` with
 * body fields left null so we don't re-prompt on every mount, but keeps
 * the user's existing `daily_calorie_goal` (or the default 2000).
 *
 * Storage rules:
 *   - Weight stored in kg (converted from lb if user picks lb).
 *   - Height stored in cm (converted from ft/in if user picks imperial).
 *   - `daily_calorie_goal` computed via Mifflin-St Jeor → activity → goal
 *     delta and rounded to nearest 10, floor 1200.
 *
 * Design tokens only — no hex, no --space-5 (scale skips 5 and 7).
 */

import { useMemo, useState } from 'react';
import { useEvents, usePreferences } from '@nothing/mini-apps-runtime';
import { EVENT_KINDS, type ActivityLevel, type GoalDirection, type Sex } from '@nothing/shared';
import { useToast } from '../../../web/src/lib/toast/context';
import {
  cmToFeetInches,
  computeBMR,
  computeTDEE,
  computeTarget,
  deriveMacroGrams,
  kgToLb,
  lbToKg,
} from '../lib/energy.ts';

type Step = 'body' | 'goal' | 'activity' | 'confirm';
const STEPS: Step[] = ['body', 'goal', 'activity', 'confirm'];

const SEX_OPTIONS: { id: Sex; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other', label: 'Other' },
];

const GOAL_OPTIONS: {
  id: GoalDirection;
  label: string;
  subtitle: string;
}[] = [
  { id: 'lose', label: 'LOSE', subtitle: 'Cut fat, keep muscle.' },
  { id: 'maintain', label: 'MAINTAIN', subtitle: 'Hold current weight.' },
  { id: 'gain', label: 'GAIN', subtitle: 'Build muscle, add mass.' },
];

const ACTIVITY_OPTIONS: {
  id: ActivityLevel;
  label: string;
  description: string;
}[] = [
  { id: 'sedentary', label: 'Sedentary', description: 'Desk job, little exercise.' },
  { id: 'light', label: 'Light', description: 'Exercise 1–3 days/week.' },
  { id: 'moderate', label: 'Moderate', description: 'Exercise 3–5 days/week.' },
  { id: 'active', label: 'Active', description: 'Exercise 6–7 days/week.' },
  { id: 'very_active', label: 'Very active', description: 'Physical job + daily training.' },
];

const DEFAULT_MACRO_PCT = { protein: 30, carbs: 40, fat: 30 };
/** Fallback if the user SKIPs without ever setting a goal. */
const DEFAULT_DAILY_GOAL_KCAL = 2000;

export function OnboardingWizard({ onClose }: { onClose: () => void }) {
  const preferences = usePreferences();
  const events = useEvents();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('body');
  const [saving, setSaving] = useState(false);

  // ── BODY step state ──────────────────────────────────────────────────────
  const [sex, setSex] = useState<Sex | null>(preferences.sex ?? null);
  const [age, setAge] = useState<string>(
    preferences.age_years != null ? String(preferences.age_years) : '',
  );
  const [heightCm, setHeightCm] = useState<string>(
    preferences.height_cm != null ? String(preferences.height_cm) : '',
  );
  // Weight is stored in kg but displayed in the user's preferred unit.
  // We keep the input as a string so partial typing doesn't get clobbered
  // by number coercion.
  const [weightRaw, setWeightRaw] = useState<string>(
    preferences.weight_goal_kg != null
      ? String(
          preferences.weight_unit === 'lb'
            ? Math.round(kgToLb(preferences.weight_goal_kg) * 10) / 10
            : preferences.weight_goal_kg,
        )
      : '',
  );

  // ── GOAL step state ──────────────────────────────────────────────────────
  const [goal, setGoal] = useState<GoalDirection | null>(
    preferences.goal_direction ?? null,
  );
  const [ratePerWeek, setRatePerWeek] = useState<number>(0.5);

  // ── ACTIVITY step state ──────────────────────────────────────────────────
  const [activity, setActivity] = useState<ActivityLevel | null>(
    preferences.activity_level ?? null,
  );

  // ── Derived numeric snapshots ────────────────────────────────────────────
  const ageNum = Number(age);
  const heightNum = Number(heightCm);
  const weightNum = Number(weightRaw);
  const weightKg =
    weightRaw.trim() === '' || !Number.isFinite(weightNum)
      ? null
      : preferences.weight_unit === 'lb'
        ? Math.round(lbToKg(weightNum) * 10) / 10
        : Math.round(weightNum * 10) / 10;

  const heightHint = useMemo(() => {
    if (!Number.isFinite(heightNum) || heightNum <= 0) return '';
    const { ft, inches } = cmToFeetInches(heightNum);
    return `≈ ${ft}′ ${inches}″`;
  }, [heightNum]);

  // Compute the projected daily target once we have every numeric input.
  const computed = useMemo(() => {
    if (
      sex == null ||
      goal == null ||
      activity == null ||
      weightKg == null ||
      !Number.isFinite(ageNum) ||
      ageNum <= 0 ||
      !Number.isFinite(heightNum) ||
      heightNum <= 0
    ) {
      return null;
    }
    const bmr = computeBMR({
      sex,
      age_years: Math.round(ageNum),
      height_cm: heightNum,
      weight_kg: weightKg,
    });
    const tdee = computeTDEE(bmr, activity);
    const target = computeTarget({
      tdee,
      goal,
      rate_kg_per_week: goal === 'maintain' ? 0 : ratePerWeek,
    });
    // The shared Preferences type doesn't currently expose macro_goal_pct
    // (it lives on the DB row but not the runtime context shape), so we use
    // the app default here — the user can retune split later from Settings.
    const macros = deriveMacroGrams(target.target_kcal, DEFAULT_MACRO_PCT);
    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      target_kcal: target.target_kcal,
      clamped: target.clamped_to_min,
      raw_target_kcal: target.raw_target_kcal,
      macros,
    };
  }, [
    sex,
    goal,
    activity,
    weightKg,
    ageNum,
    heightNum,
    ratePerWeek,
  ]);

  const bodyStepValid =
    sex != null &&
    Number.isFinite(ageNum) &&
    ageNum > 0 &&
    ageNum < 130 &&
    Number.isFinite(heightNum) &&
    heightNum > 50 &&
    heightNum < 260 &&
    weightKg != null &&
    weightKg > 20 &&
    weightKg < 400;
  const goalStepValid = goal != null;
  const activityStepValid = activity != null;

  const stepIdx = STEPS.indexOf(step);
  const canGoNext =
    (step === 'body' && bodyStepValid) ||
    (step === 'goal' && goalStepValid) ||
    (step === 'activity' && activityStepValid) ||
    step === 'confirm';

  function goBack() {
    if (stepIdx > 0) setStep(STEPS[stepIdx - 1]);
  }
  function goNext() {
    if (!canGoNext) return;
    if (stepIdx < STEPS.length - 1) setStep(STEPS[stepIdx + 1]);
  }

  async function saveAndClose() {
    if (!computed || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sex,
          age_years: Math.round(ageNum),
          height_cm: heightNum,
          activity_level: activity,
          goal_direction: goal,
          daily_calorie_goal: computed.target_kcal,
          onboarded_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        toast.error('Could not save your profile. Try again.');
        setSaving(false);
        return;
      }
      events.emit(EVENT_KINDS.preferences_updated, { at: new Date().toISOString() });
      toast.info(`Daily target set to ${computed.target_kcal.toLocaleString()} kcal.`);
      onClose();
    } catch {
      toast.error('Network error. Try again.');
      setSaving(false);
    }
  }

  async function skip() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          onboarded_at: new Date().toISOString(),
          // If they never set one, plant the safe default so downstream views
          // don't show the "no goal" state forever.
          ...(preferences.daily_calorie_goal == null
            ? { daily_calorie_goal: DEFAULT_DAILY_GOAL_KCAL }
            : {}),
        }),
      });
      if (!res.ok) {
        toast.error('Could not save. Try again.');
        setSaving(false);
        return;
      }
      events.emit(EVENT_KINDS.preferences_updated, { at: new Date().toISOString() });
      onClose();
    } catch {
      toast.error('Network error. Try again.');
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        overflowY: 'auto',
        // Safe-area padding so the wizard clears iOS Dynamic Island + home
        // indicator when the PWA runs standalone.
        padding:
          'calc(var(--space-4) + env(safe-area-inset-top)) calc(var(--space-4) + env(safe-area-inset-right)) calc(var(--space-4) + env(safe-area-inset-bottom)) calc(var(--space-4) + env(safe-area-inset-left))',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          marginTop: 'var(--space-6)',
          marginBottom: 'var(--space-8)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-visible)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        <ProgressDots currentIdx={stepIdx} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span id="onboarding-title" className="label">
            SET UP YOUR PROFILE
          </span>
          <span
            className="caption"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {step === 'body' && 'Tell us about your body so we can compute your target.'}
            {step === 'goal' && 'Where are you heading?'}
            {step === 'activity' && 'How active is your typical week?'}
            {step === 'confirm' && "Here's what we compute for you."}
          </span>
        </div>

        {step === 'body' && (
          <BodyStep
            sex={sex}
            setSex={setSex}
            age={age}
            setAge={setAge}
            heightCm={heightCm}
            setHeightCm={setHeightCm}
            heightHint={heightHint}
            weightRaw={weightRaw}
            setWeightRaw={setWeightRaw}
            weightUnit={preferences.weight_unit}
          />
        )}

        {step === 'goal' && (
          <GoalStep
            goal={goal}
            setGoal={setGoal}
            rate={ratePerWeek}
            setRate={setRatePerWeek}
          />
        )}

        {step === 'activity' && (
          <ActivityStep activity={activity} setActivity={setActivity} />
        )}

        {step === 'confirm' && computed && <ConfirmStep computed={computed} />}
        {step === 'confirm' && !computed && (
          <p className="caption" style={{ color: 'var(--color-accent)' }}>
            Some fields are missing. Go back and complete them.
          </p>
        )}

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={goBack}
            disabled={stepIdx === 0}
            className="btn btn-secondary"
            style={{
              padding: 'var(--space-3) var(--space-6)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: stepIdx === 0 ? 'not-allowed' : 'pointer',
              opacity: stepIdx === 0 ? 0.4 : 1,
            }}
          >
            Back
          </button>

          {step !== 'confirm' ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              style={{
                background: canGoNext
                  ? 'var(--color-accent)'
                  : 'var(--color-surface-raised)',
                color: canGoNext
                  ? 'var(--color-text-display)'
                  : 'var(--color-text-disabled)',
                border: 0,
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-3) var(--space-6)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: canGoNext ? 'pointer' : 'not-allowed',
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={saveAndClose}
              disabled={!computed || saving}
              style={{
                background: computed
                  ? 'var(--color-accent)'
                  : 'var(--color-surface-raised)',
                color: computed
                  ? 'var(--color-text-display)'
                  : 'var(--color-text-disabled)',
                border: 0,
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-3) var(--space-6)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: computed && !saving ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? 'Saving…' : 'Start tracking'}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={skip}
          disabled={saving}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--color-text-secondary)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: saving ? 'not-allowed' : 'pointer',
            alignSelf: 'center',
            textDecoration: 'underline',
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ─── Progress dots ──────────────────────────────────────────────────────────

function ProgressDots({ currentIdx }: { currentIdx: number }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        alignItems: 'center',
      }}
      aria-label={`Step ${currentIdx + 1} of ${STEPS.length}`}
    >
      {STEPS.map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background:
              i === currentIdx
                ? 'var(--color-accent)'
                : i < currentIdx
                  ? 'var(--color-text-secondary)'
                  : 'var(--color-border-visible)',
            transition: 'background var(--dur-fast) var(--ease-out)',
          }}
        />
      ))}
    </div>
  );
}

// ─── BODY step ──────────────────────────────────────────────────────────────

function BodyStep({
  sex,
  setSex,
  age,
  setAge,
  heightCm,
  setHeightCm,
  heightHint,
  weightRaw,
  setWeightRaw,
  weightUnit,
}: {
  sex: Sex | null;
  setSex: (s: Sex) => void;
  age: string;
  setAge: (v: string) => void;
  heightCm: string;
  setHeightCm: (v: string) => void;
  heightHint: string;
  weightRaw: string;
  setWeightRaw: (v: string) => void;
  weightUnit: 'kg' | 'lb';
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          SEX
        </span>
        <div
          role="radiogroup"
          aria-label="Sex"
          style={{ display: 'flex', gap: 'var(--space-2)' }}
        >
          {SEX_OPTIONS.map((opt) => {
            const active = sex === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSex(opt.id)}
                style={{
                  flex: 1,
                  background: active ? 'var(--color-accent)' : 'transparent',
                  color: active
                    ? 'var(--color-text-display)'
                    : 'var(--color-text-primary)',
                  border: `1px solid ${
                    active ? 'var(--color-accent)' : 'var(--color-border-visible)'
                  }`,
                  borderRadius: 'var(--radius-button)',
                  padding: 'var(--space-3) var(--space-4)',
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-label)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <label
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            AGE (YEARS)
          </span>
          <input
            className="input data"
            type="number"
            inputMode="numeric"
            min={1}
            max={129}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="30"
            style={{ fontFamily: 'var(--font-label)' }}
          />
        </label>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          HEIGHT (CM) {heightHint && (
            <span
              className="data"
              style={{
                color: 'var(--color-text-disabled)',
                marginLeft: 'var(--space-2)',
              }}
            >
              {heightHint}
            </span>
          )}
        </span>
        <input
          className="input data"
          type="number"
          inputMode="numeric"
          min={51}
          max={259}
          step={0.5}
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
          placeholder="175"
          style={{ fontFamily: 'var(--font-label)' }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          CURRENT WEIGHT ({weightUnit.toUpperCase()})
        </span>
        <input
          className="input data"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.1}
          value={weightRaw}
          onChange={(e) => setWeightRaw(e.target.value)}
          placeholder={weightUnit === 'lb' ? '165' : '75'}
          style={{ fontFamily: 'var(--font-label)' }}
        />
      </label>
    </div>
  );
}

// ─── GOAL step ──────────────────────────────────────────────────────────────

function GoalStep({
  goal,
  setGoal,
  rate,
  setRate,
}: {
  goal: GoalDirection | null;
  setGoal: (g: GoalDirection) => void;
  rate: number;
  setRate: (r: number) => void;
}) {
  const aggressive = rate > 0.75;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div
        role="radiogroup"
        aria-label="Goal"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        {GOAL_OPTIONS.map((opt) => {
          const active = goal === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setGoal(opt.id)}
              style={{
                textAlign: 'left',
                background: 'rgba(0, 0, 0, 0.5)',
                color: 'var(--color-text-primary)',
                border: `1px solid ${
                  active ? 'var(--color-accent)' : 'var(--color-border-visible)'
                }`,
                borderRadius: 'var(--radius-card)',
                padding: 'var(--space-4)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
              }}
            >
              <span
                className="label"
                style={{
                  color: active ? 'var(--color-accent)' : 'var(--color-text-display)',
                }}
              >
                {opt.label}
              </span>
              <span
                className="caption"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {opt.subtitle}
              </span>
            </button>
          );
        })}
      </div>

      {goal === 'lose' || goal === 'gain' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            RATE — {rate.toFixed(2)} KG / WEEK
          </span>
          <input
            type="range"
            min={0.25}
            max={1}
            step={0.05}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: 'var(--color-accent)',
            }}
            aria-label="Rate in kilograms per week"
          />
          {aggressive && (
            <span
              className="caption"
              style={{ color: 'var(--color-accent)' }}
            >
              Aggressive — recommended for short cycles only.
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── ACTIVITY step ──────────────────────────────────────────────────────────

function ActivityStep({
  activity,
  setActivity,
}: {
  activity: ActivityLevel | null;
  setActivity: (a: ActivityLevel) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Activity level"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      {ACTIVITY_OPTIONS.map((opt) => {
        const active = activity === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setActivity(opt.id)}
            style={{
              textAlign: 'left',
              background: 'rgba(0, 0, 0, 0.5)',
              color: 'var(--color-text-primary)',
              border: `1px solid ${
                active ? 'var(--color-accent)' : 'var(--color-border-visible)'
              }`,
              borderRadius: 'var(--radius-card)',
              padding: 'var(--space-3) var(--space-4)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
            }}
          >
            <span
              className="label"
              style={{
                color: active ? 'var(--color-accent)' : 'var(--color-text-display)',
              }}
            >
              {opt.label.toUpperCase()}
            </span>
            <span
              className="caption"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {opt.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── CONFIRM step ───────────────────────────────────────────────────────────

function ConfirmStep({
  computed,
}: {
  computed: {
    bmr: number;
    tdee: number;
    target_kcal: number;
    clamped: boolean;
    raw_target_kcal: number;
    macros: { protein_g: number; carbs_g: number; fat_g: number };
  };
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <section
        aria-label="Computed target"
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
        <span className="label">DAILY TARGET · KCAL</span>
        <span className="display-xl">
          {computed.target_kcal.toLocaleString()}
        </span>
        {computed.clamped && (
          <span className="caption" style={{ color: 'var(--color-accent)' }}>
            Clamped to 1200 kcal floor — the formula suggested{' '}
            {computed.raw_target_kcal.toLocaleString()}.
          </span>
        )}
      </section>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-body-sm)',
        }}
      >
        <tbody>
          <StatRow label="BMR" value={`${computed.bmr.toLocaleString()} kcal`} />
          <StatRow label="TDEE" value={`${computed.tdee.toLocaleString()} kcal`} />
          <StatRow
            label="PROTEIN"
            value={`${computed.macros.protein_g} g`}
          />
          <StatRow
            label="CARBS"
            value={`${computed.macros.carbs_g} g`}
          />
          <StatRow label="FAT" value={`${computed.macros.fat_g} g`} />
        </tbody>
      </table>

      <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
        You can change these anytime in Settings.
      </span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
      <td
        style={{
          padding: 'var(--space-2) 0',
          color: 'var(--color-text-secondary)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontSize: 'var(--text-caption)',
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: 'var(--space-2) 0',
          color: 'var(--color-text-display)',
          textAlign: 'right',
          fontFamily: 'var(--font-label)',
        }}
      >
        {value}
      </td>
    </tr>
  );
}
