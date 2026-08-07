'use client';

/**
 * Calorie Lite — reference mini-app page.
 *
 * Three states inside a single client component:
 *   1. TODAY   — running kcal total vs `preferences.daily_calorie_goal`, list
 *                of today's entries, "+ ADD MEAL" CTA.
 *   2. ADD     — inline form (meal name + kcal + optional serving size + meal
 *                slot). POSTs to `/api/mini-apps/calorie-lite/entries`, emits
 *                `calorie.entry.added` on the shared event bus.
 *   3. HISTORY — last 7 days, grouped by date, with each day's kcal vs goal.
 *
 * All data flows through `/api/mini-apps/calorie-lite/entries` (auth-gated +
 * entitlement-gated in the route handler). This page NEVER talks to Supabase
 * directly — the shell already ensures a session exists (Proxy) and that the
 * caller is entitled (Proxy redirect + defence-in-depth 402 at the API).
 *
 * Design constraints (see prompt):
 *   - Card: rgba(0,0,0,0.5) background, --color-border-visible outline,
 *     --radius-card, --space-4 inner padding.
 *   - Doto (`.display-xl`) for the daily total number.
 *   - Space Mono (`.data`) for entry times + kcal counts.
 *   - Space Grotesk (default body) for everything else.
 *   - Cadmium red (--color-accent) only for CTAs + progress bar fill.
 *   - No hex colors — tokens only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEvents, usePreferences, useUser } from '@nothing/mini-apps-runtime';
import type { CalorieEntry, Meal } from '@nothing/shared';
import { EVENT_KINDS } from '@nothing/shared';

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

/** YYYY-MM-DD for the caller's local timezone (not UTC). */
function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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

  const todayTotal = useMemo(
    () => todayEntries.reduce((sum, e) => sum + (e.kcal ?? 0), 0),
    [todayEntries],
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
      <Header view={view} onChangeView={setView} />

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
          goal={goalKcal}
          goalIsExplicit={goalIsExplicit}
          loading={entries === null}
        />
      )}
    </div>
  );
}

// ─── Header + tabs ──────────────────────────────────────────────────────────

function Header({ view, onChangeView }: { view: View; onChangeView: (v: View) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <span className="label">CALORIE LITE</span>
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
  loading,
  onAdd,
}: {
  total: number;
  goal: number;
  goalIsExplicit: boolean;
  progress: number;
  over: boolean;
  entries: CalorieEntry[];
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
    <section
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px dashed var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-8) var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-4)',
        textAlign: 'center',
      }}
    >
      <button
        type="button"
        onClick={onAdd}
        aria-label="Add first meal"
        style={{
          width: 72,
          height: 72,
          borderRadius: 'var(--radius-card)',
          border: '1px solid var(--color-border-visible)',
          background: 'transparent',
          color: 'var(--color-text-display)',
          fontSize: 40,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        +
      </button>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-body)' }}>
        Nothing logged yet. Add your first meal.
      </p>
    </section>
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
      {sorted.map((e) => (
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
        </li>
      ))}
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // userId is currently only used for optimistic-UI paths in v2; keeping the
  // prop threaded through so future work (e.g. offline queue keyed on
  // caller) has an obvious wire.
  void userId;

  const canSubmit = kcal.trim() !== '' && Number(kcal) >= 0 && !saving;

  async function submit(evt: React.FormEvent) {
    evt.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const rawInputParts = [mealName.trim(), servingSize.trim()].filter(Boolean);
      const res = await fetch('/api/mini-apps/calorie-lite/entries', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meal,
          kcal: Number(kcal),
          raw_input: rawInputParts.length ? rawInputParts.join(' · ') : null,
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

// ─── History view ───────────────────────────────────────────────────────────

function HistoryView({
  entries,
  goal,
  goalIsExplicit,
  loading,
}: {
  entries: CalorieEntry[];
  goal: number;
  goalIsExplicit: boolean;
  loading: boolean;
}) {
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

  if (byDay.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-secondary)' }}>
        No history yet. Log a meal to start tracking.
      </p>
    );
  }

  return (
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
        const total = dayEntries.reduce((s, e) => s + (e.kcal ?? 0), 0);
        const pct = Math.min(1, goal > 0 ? total / goal : 0);
        const over = goalIsExplicit && total > goal;
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
            <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
              {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
              {over ? ' · over goal' : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
