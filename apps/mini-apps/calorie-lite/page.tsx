'use client';

/**
 * Calorie Lite — reference mini-app page (v2).
 *
 * v2 changes over v1:
 *   - TODAY: streak chip in the header, macro breakdown card under the kcal
 *     card, per-entry macro line beneath each entry.
 *   - ADD:   optional Protein / Carbs / Fat inputs beneath kcal. The API
 *     schema already accepts these; v1 just didn't send them.
 *   - HISTORY: 7-day sparkline at the top, streak line (best + current),
 *     per-day macro totals in each row.
 *
 * No schema changes, no new API endpoints. All calculation is pure and lives
 * in `./lib/aggregate.ts` so it stays testable and reusable.
 *
 * Design constraints (unchanged from v1):
 *   - Card: rgba(0,0,0,0.5) background, --color-border-visible outline,
 *     --radius-card, --space-4 inner padding.
 *   - Doto (`.display-xl`) for the daily total number.
 *   - Space Mono (`.data`) for entry times + kcal counts.
 *   - Space Grotesk (default body) for everything else.
 *   - Cadmium red (--color-accent) only for CTAs, accent bars, streak dot.
 *   - No hex colors — tokens only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EmptyState,
  useEvents,
  usePreferences,
  useUser,
} from '@nothing/mini-apps-runtime';
import type { CalorieEntry, Meal } from '@nothing/shared';
import { EVENT_KINDS } from '@nothing/shared';
import { MacroCard } from './components/MacroCard.tsx';
import { StreakChip } from './components/StreakChip.tsx';
import { Sparkline, type SparklineDay } from './components/Sparkline.tsx';
import {
  computeStreak,
  dailyTotals,
  toLocalDateKey,
} from './lib/aggregate.ts';

type View = 'today' | 'add' | 'history';

const MEAL_OPTIONS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];

// Fallback goal when the user hasn't set one in Settings yet. Kept low + round
// so the progress bar communicates "you have no target set" rather than
// "you're doing great" — 2000 kcal is a neutral default, not a prescription.
const DEFAULT_DAILY_GOAL_KCAL = 2000;

/** HH:MM for a timestamp — matches the Space Mono `.data` style. */
function toLocalTime(iso: string): string {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 5);
}

/** e.g. "MON · MAR 03" — kept UPPER + short so it holds Space Mono well. */
function toDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
  const month = dt.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  return `${weekday} · ${month} ${String(d).padStart(2, '0')}`;
}

/** Shift a local YYYY-MM-DD key by `deltaDays`, using local Date math. */
function shiftDateKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** 3-letter uppercase weekday for a YYYY-MM-DD (local). */
function toWeekdayShort(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase().slice(0, 3);
}

/** Small helper so the per-entry macro line stays consistent everywhere. */
function macroLine(p: number, c: number, f: number): string | null {
  if (p === 0 && c === 0 && f === 0) return null;
  return `${p}p / ${c}c / ${f}f`;
}

export default function CalorieLitePage() {
  const user = useUser();
  const preferences = usePreferences();
  const events = useEvents();

  const goalKcal = preferences.daily_calorie_goal ?? DEFAULT_DAILY_GOAL_KCAL;
  const goalIsExplicit = preferences.daily_calorie_goal != null;

  const [view, setView] = useState<View>('today');
  const [entries, setEntries] = useState<CalorieEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const todayKey = useMemo(() => toLocalDateKey(new Date().toISOString()), []);

  const loadEntries = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/entries', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        // 402 shouldn't happen in normal flow — Proxy redirects unentitled
        // users at /app/calorie-lite before this component mounts. But if it
        // does (e.g. subscription lapsed while the tab was open), surface it.
        if (res.status === 402) {
          setLoadError('Subscription required. Refresh to renew.');
        } else if (res.status === 401) {
          setLoadError('Session expired. Sign in again.');
        } else {
          setLoadError('Could not load entries.');
        }
        setEntries([]);
        return;
      }
      const body = (await res.json()) as { entries: CalorieEntry[] };
      setEntries(body.entries);
    } catch {
      setLoadError('Network error.');
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // Re-load when another tab or component in the same session adds an entry.
  useEffect(() => {
    const off = events.subscribe(EVENT_KINDS.calorie_entry_added, () => {
      void loadEntries();
    });
    return off;
  }, [events, loadEntries]);

  const todayEntries = useMemo(
    () => (entries ?? []).filter((e) => toLocalDateKey(e.entered_at) === todayKey),
    [entries, todayKey],
  );

  // One pass over all entries — reused by today totals, history, and streak.
  const daily = useMemo(() => dailyTotals(entries ?? []), [entries]);
  const todayBucket = daily[todayKey];
  const todayTotal = todayBucket?.kcal ?? 0;
  const todayProtein = todayBucket?.protein ?? 0;
  const todayCarbs = todayBucket?.carbs ?? 0;
  const todayFat = todayBucket?.fat ?? 0;

  const streak = useMemo(
    () => computeStreak(entries ?? [], todayKey),
    [entries, todayKey],
  );

  const progressPct = Math.min(1, goalKcal > 0 ? todayTotal / goalKcal : 0);
  const over = goalIsExplicit && todayTotal > goalKcal;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-12)',
      }}
    >
      <Header view={view} onChangeView={setView} streak={streak.current} />

      {loadError && (
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
          {loadError}
        </div>
      )}

      {view === 'today' && (
        <TodayView
          total={todayTotal}
          goal={goalKcal}
          goalIsExplicit={goalIsExplicit}
          progress={progressPct}
          over={over}
          entries={todayEntries}
          protein={todayProtein}
          carbs={todayCarbs}
          fat={todayFat}
          loading={entries === null}
          onAdd={() => setView('add')}
        />
      )}

      {view === 'add' && (
        <AddView
          userId={user.id}
          onCancel={() => setView('today')}
          onSaved={async () => {
            events.emit(EVENT_KINDS.calorie_entry_added, { at: new Date().toISOString() });
            await loadEntries();
            setView('today');
          }}
        />
      )}

      {view === 'history' && (
        <HistoryView
          entries={entries ?? []}
          daily={daily}
          todayKey={todayKey}
          goal={goalKcal}
          goalIsExplicit={goalIsExplicit}
          streakCurrent={streak.current}
          streakBest={streak.best}
          loading={entries === null}
        />
      )}
    </div>
  );
}

// ─── Header + tabs ──────────────────────────────────────────────────────────

function Header({
  view,
  onChangeView,
  streak,
}: {
  view: View;
  onChangeView: (v: View) => void;
  streak: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <span className="label">CALORIE LITE</span>
        <StreakChip current={streak} />
      </div>
      <div
        role="tablist"
        aria-label="Calorie views"
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <TabButton active={view === 'today'} onClick={() => onChangeView('today')}>
          Today
        </TabButton>
        <TabButton active={view === 'history'} onClick={() => onChangeView('history')}>
          History
        </TabButton>
      </div>
    </div>
  );
}

function TabButton({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 0,
        borderBottom: active
          ? '2px solid var(--color-text-display)'
          : '2px solid transparent',
        color: active ? 'var(--color-text-display)' : 'var(--color-text-secondary)',
        padding: 'var(--space-2) var(--space-3)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

// ─── Today view ─────────────────────────────────────────────────────────────

function TodayView({
  total,
  goal,
  goalIsExplicit,
  progress,
  over,
  entries,
  protein,
  carbs,
  fat,
  loading,
  onAdd,
}: {
  total: number;
  goal: number;
  goalIsExplicit: boolean;
  progress: number;
  over: boolean;
  entries: CalorieEntry[];
  protein: number;
  carbs: number;
  fat: number;
  loading: boolean;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <TotalCard
        total={total}
        goal={goal}
        goalIsExplicit={goalIsExplicit}
        progress={progress}
        over={over}
      />

      <MacroCard protein={protein} carbs={carbs} fat={fat} />

      <button
        type="button"
        onClick={onAdd}
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
        + Add meal
      </button>

      {loading ? (
        <p className="caption">Loading…</p>
      ) : entries.length === 0 ? (
        <EmptyToday onAdd={onAdd} />
      ) : (
        <EntryList entries={entries} />
      )}
    </div>
  );
}

function TotalCard({
  total,
  goal,
  goalIsExplicit,
  progress,
  over,
}: {
  total: number;
  goal: number;
  goalIsExplicit: boolean;
  progress: number;
  over: boolean;
}) {
  const remaining = Math.max(0, goal - total);
  const remainingLabel = over
    ? `${(total - goal).toLocaleString()} OVER`
    : goalIsExplicit
      ? `${remaining.toLocaleString()} LEFT`
      : `${goal.toLocaleString()} DEFAULT`;

  return (
    <section
      aria-label="Today's total"
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
      <span className="label">TODAY · KCAL</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
        <span className="display-xl">{total.toLocaleString()}</span>
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          / {goal.toLocaleString()}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress toward daily goal"
        style={{
          position: 'relative',
          height: 4,
          background: 'var(--color-border)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${Math.round(progress * 100)}%`,
            background: 'var(--color-accent)',
            transition: 'width var(--dur-medium) var(--ease-out)',
          }}
        />
      </div>

      <span className="data" style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-caption)' }}>
        {remainingLabel}
      </span>
    </section>
  );
}

function EmptyToday({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      icon="◐"
      title="No meals logged"
      body="Log your first meal to start tracking calories and macros."
      primaryAction={{ label: '+ Add meal', onClick: onAdd, ariaLabel: 'Add first meal' }}
    />
  );
}

function EntryList({ entries }: { entries: CalorieEntry[] }) {
  // Newest first.
  const sorted = [...entries].sort((a, b) =>
    b.entered_at.localeCompare(a.entered_at),
  );
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {sorted.map((e) => {
        const macros = macroLine(e.protein_g ?? 0, e.carbs_g ?? 0, e.fat_g ?? 0);
        return (
          <li
            key={e.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
              padding: 'var(--space-4) 0',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
              <span
                style={{
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--text-body)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {e.raw_input || mealLabel(e.meal)}
              </span>
              <span
                className="data"
                style={{
                  color: 'var(--color-text-disabled)',
                  fontSize: 'var(--text-caption)',
                  letterSpacing: '0.06em',
                }}
              >
                {toLocalTime(e.entered_at)} · {mealLabel(e.meal).toUpperCase()}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 'var(--space-1)',
              }}
            >
              <span
                className="data"
                style={{
                  color: 'var(--color-text-display)',
                  fontSize: 'var(--text-body)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {e.kcal.toLocaleString()}
              </span>
              {macros && (
                <span
                  className="data"
                  style={{
                    color: 'var(--color-text-disabled)',
                    fontSize: 'var(--text-caption)',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {macros}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function mealLabel(m: Meal): string {
  return MEAL_OPTIONS.find((o) => o.id === m)?.label ?? m;
}

// ─── Add view ───────────────────────────────────────────────────────────────

function AddView({
  userId,
  onCancel,
  onSaved,
}: {
  userId: string;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [mealName, setMealName] = useState('');
  const [kcal, setKcal] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [meal, setMeal] = useState<Meal>('lunch');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // userId is currently only used for optimistic-UI paths in v2; keeping the
  // prop threaded through so future work (e.g. offline queue keyed on
  // caller) has an obvious wire.
  void userId;

  const canSubmit = kcal.trim() !== '' && Number(kcal) >= 0 && !saving;

  /**
   * Turn a text input into an integer gram count for a macro field.
   * Empty string → omit the field (API defaults to 0). Non-numeric or
   * negative → treat as 0, matching server-side clamping.
   */
  function macroOrUndefined(raw: string): number | undefined {
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    const n = Math.max(0, Math.round(Number(trimmed)));
    return Number.isFinite(n) ? n : undefined;
  }

  async function submit(evt: React.FormEvent) {
    evt.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const rawInputParts = [mealName.trim(), servingSize.trim()].filter(Boolean);
      const proteinN = macroOrUndefined(protein);
      const carbsN = macroOrUndefined(carbs);
      const fatN = macroOrUndefined(fat);
      const res = await fetch('/api/mini-apps/calorie-lite/entries', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meal,
          kcal: Number(kcal),
          raw_input: rawInputParts.length ? rawInputParts.join(' · ') : null,
          ...(proteinN !== undefined ? { protein_g: proteinN } : {}),
          ...(carbsN !== undefined ? { carbs_g: carbsN } : {}),
          ...(fatN !== undefined ? { fat_g: fatN } : {}),
        }),
      });
      if (!res.ok) {
        if (res.status === 402) {
          setError('Subscription required to save entries.');
        } else if (res.status === 401) {
          setError('Session expired. Sign in again.');
        } else if (res.status === 400) {
          const body = await res.json().catch(() => null);
          setError(body?.error === 'invalid_body' ? 'Check the fields and try again.' : 'Could not save.');
        } else {
          setError('Could not save.');
        }
        setSaving(false);
        return;
      }
      await onSaved();
    } catch {
      setError('Network error.');
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <span className="label">ADD MEAL</span>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>MEAL NAME</span>
        <input
          className="input"
          type="text"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          placeholder="e.g. Chicken bowl"
          autoComplete="off"
          maxLength={120}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>KCAL</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          max={20000}
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          placeholder="0"
          required
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          MACROS — OPTIONAL
        </span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-3)',
          }}
        >
          <MacroInput
            label="PROTEIN (G)"
            value={protein}
            onChange={setProtein}
            id="cl-macro-protein"
          />
          <MacroInput
            label="CARBS (G)"
            value={carbs}
            onChange={setCarbs}
            id="cl-macro-carbs"
          />
          <MacroInput
            label="FAT (G)"
            value={fat}
            onChange={setFat}
            id="cl-macro-fat"
          />
        </div>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>SERVING SIZE (OPTIONAL)</span>
        <input
          className="input"
          type="text"
          value={servingSize}
          onChange={(e) => setServingSize(e.target.value)}
          placeholder="e.g. 1 bowl · 300g"
          autoComplete="off"
          maxLength={80}
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>MEAL SLOT</span>
        <div
          role="radiogroup"
          aria-label="Meal slot"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
        >
          {MEAL_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={meal === m.id}
              onClick={() => setMeal(m.id)}
              style={{
                background: meal === m.id ? 'var(--color-text-display)' : 'transparent',
                color: meal === m.id ? 'var(--color-bg)' : 'var(--color-text-primary)',
                border: `1px solid ${meal === m.id ? 'var(--color-text-display)' : 'var(--color-border-visible)'}`,
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-2) var(--space-4)',
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

      {error && (
        <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
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
          {saving ? 'Saving…' : 'Save'}
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

function MacroInput({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <label
      htmlFor={id}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
    >
      <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <input
        id={id}
        className="input"
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
    </label>
  );
}

// ─── History view ───────────────────────────────────────────────────────────

function HistoryView({
  entries,
  daily,
  todayKey,
  goal,
  goalIsExplicit,
  streakCurrent,
  streakBest,
  loading,
}: {
  entries: CalorieEntry[];
  daily: Record<string, { kcal: number; protein: number; carbs: number; fat: number; entries: number }>;
  todayKey: string;
  goal: number;
  goalIsExplicit: boolean;
  streakCurrent: number;
  streakBest: number;
  loading: boolean;
}) {
  // Build the 7-day window ending today (oldest first for the sparkline).
  const sparklineDays: SparklineDay[] = useMemo(() => {
    const out: SparklineDay[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const key = shiftDateKey(todayKey, -i);
      const kcal = daily[key]?.kcal ?? 0;
      out.push({
        key,
        kcal,
        weekday: toWeekdayShort(key),
        active: kcal > 0,
      });
    }
    return out;
  }, [daily, todayKey]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalorieEntry[]>();
    for (const e of entries) {
      const key = toLocalDateKey(e.entered_at);
      const bucket = map.get(key);
      if (bucket) bucket.push(e);
      else map.set(key, [e]);
    }
    // Newest day first.
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  if (loading) {
    return <p className="caption">Loading…</p>;
  }

  // With zero entries anywhere, the sparkline is 7 empty dots and the day list
  // is empty — that would render as 3 useless surfaces stacked on top of each
  // other. Show a single, actionable empty state instead.
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="◐"
        title="Nothing to chart yet"
        body="Log meals for a few days to see your trend and streaks."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <section
        aria-label="Last 7 days"
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
        <span className="label">LAST 7 DAYS</span>
        <Sparkline days={sparklineDays} goal={goalIsExplicit ? goal : null} />
        <span
          className="data"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
          }}
        >
          BEST: {streakBest}D · CURRENT: {streakCurrent}D
        </span>
      </section>

      {byDay.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>
          No history yet. Log a meal to start tracking.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          {byDay.map(([dateKey, dayEntries]) => {
            const bucket = daily[dateKey] ?? {
              kcal: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
              entries: dayEntries.length,
            };
            const total = bucket.kcal;
            const pct = Math.min(1, goal > 0 ? total / goal : 0);
            const over = goalIsExplicit && total > goal;
            const macros = macroLine(bucket.protein, bucket.carbs, bucket.fat);
            return (
              <li
                key={dateKey}
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
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 'var(--space-3)',
                  }}
                >
                  <span className="label">{toDateLabel(dateKey)}</span>
                  <span
                    className="data"
                    style={{
                      color: 'var(--color-text-display)',
                      fontSize: 'var(--text-body)',
                      fontWeight: 700,
                    }}
                  >
                    {total.toLocaleString()}
                    <span
                      className="label"
                      style={{ color: 'var(--color-text-secondary)', marginLeft: 'var(--space-2)' }}
                    >
                      / {goal.toLocaleString()}
                    </span>
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(pct * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progress for ${toDateLabel(dateKey)}`}
                  style={{
                    position: 'relative',
                    height: 4,
                    background: 'var(--color-border)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: `${Math.round(pct * 100)}%`,
                      background: 'var(--color-accent)',
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 'var(--space-3)',
                  }}
                >
                  <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
                    {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
                    {over ? ' · over goal' : ''}
                  </span>
                  {macros && (
                    <span
                      className="data"
                      style={{
                        color: 'var(--color-text-disabled)',
                        fontSize: 'var(--text-caption)',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {macros}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
