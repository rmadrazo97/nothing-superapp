'use client';

/**
 * Habits — home / landing (v0.5.12).
 *
 * Layout:
 *   1. Compact header ("HABITS · MINI APP" kicker only).
 *   2. THIS WEEK PixelCard hero — 4 KPIs (DONE / STREAK / ACTIVE / RATE)
 *      inside a PixelMetricGrid, matching the Gym home design language.
 *   3. TODAY · <date> — one row per active habit with a tap-to-toggle
 *      checkbox + streak count.
 *   4. + NEW HABIT — opens a BottomSheet with name + emoji + target/week.
 *
 * Streak is derived client-side from the completions list (see lib/api.ts
 * → computeStreak). Toggle is optimistic; refetches on failure.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { LoadErrorCard } from '@nothing/mini-apps-runtime';
import type { Habit, HabitCompletion } from '@nothing/shared';
import { useToast } from '../../web/src/lib/toast/context';
import { PixelCard, PixelMetricGrid } from '../../web/src/components/pixel-ui';
import { BottomSheet } from '../../web/src/components/shell/BottomSheet';
import { SwipeableRow } from '../../web/src/components/shell/SwipeableRow';
import * as api from './lib/api.ts';
import {
  ApiError,
  computeStreak,
  formatLocalDate,
  todayLocal,
  weekRange,
} from './lib/api.ts';

const CARD_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.5)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-4)',
};

const INPUT_STYLE: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-input)',
  padding: 'var(--space-2) var(--space-3)',
  color: 'var(--color-text-display)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-body)',
  minHeight: 44,
};

const CHIP_ACTIVE: CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-button)',
  border: '1px solid var(--color-accent)',
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  minHeight: 32,
  cursor: 'pointer',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.06em',
};

const CHIP_INACTIVE: CSSProperties = {
  ...CHIP_ACTIVE,
  background: 'transparent',
  border: '1px solid var(--color-border-visible)',
  color: 'var(--color-text-secondary)',
};

// Example habits shown as tap-to-create CTAs when the user has no habits yet.
const EXAMPLE_HABITS: { name: string; emoji: string }[] = [
  { name: 'Meditate 10 min', emoji: '🧘' },
  { name: 'Drink 8 glasses of water', emoji: '💧' },
  { name: 'Read for 20 min', emoji: '📖' },
];

export default function HabitsHomePage() {
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [completions, setCompletions] = useState<HabitCompletion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [newTarget, setNewTarget] = useState(7);
  // Edit-sheet state. `editing` is the habit being edited (null when the
  // sheet is for creating a new one). Shares the sheet visual with +NEW.
  const [editing, setEditing] = useState<Habit | null>(null);
  const [seedingExample, setSeedingExample] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      // 60-day window: covers the current + prior week for the hero KPIs
      // and gives every habit enough history for its streak walk (rarely
      // meaningful beyond a couple weeks anyway).
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 60);
      const [habitsResp, completionsResp] = await Promise.all([
        api.listHabits(),
        api.listCompletions(formatLocalDate(from), formatLocalDate(to)),
      ]);
      setHabits(habitsResp);
      setCompletions(completionsResp);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Network error.';
      setError(msg);
      toast.error('Could not load habits.');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayLocal();
  const week = useMemo(() => weekRange(), []);
  const activeHabits = useMemo(
    () => (habits ? habits.filter((h) => h.active) : []),
    [habits],
  );

  // Set of "YYYY-MM-DD" dates checked, per habit.
  const completionsByHabit = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!completions) return map;
    for (const c of completions) {
      const s = map.get(c.habit_id) ?? new Set<string>();
      s.add(c.completed_on);
      map.set(c.habit_id, s);
    }
    return map;
  }, [completions]);

  const doneToday = useMemo(() => {
    return activeHabits.filter((h) => completionsByHabit.get(h.id)?.has(today)).length;
  }, [activeHabits, completionsByHabit, today]);

  const summary = useMemo(() => {
    // 4 KPIs for the hero.
    let doneThisWeek = 0;
    let expectedThisWeek = 0;
    let bestStreak = 0;
    for (const h of activeHabits) {
      const set = completionsByHabit.get(h.id) ?? new Set<string>();
      // Count checks between week.from and week.to inclusive.
      for (const iso of set) {
        if (iso >= week.from && iso <= week.to) doneThisWeek += 1;
      }
      expectedThisWeek += h.target_days_per_week;
      const streak = computeStreak(set);
      if (streak > bestStreak) bestStreak = streak;
    }
    const completionRate =
      expectedThisWeek === 0 ? 0 : Math.round((doneThisWeek / expectedThisWeek) * 100);
    return {
      doneThisWeek,
      bestStreak,
      activeCount: activeHabits.length,
      completionRate: Math.min(100, completionRate),
    };
  }, [activeHabits, completionsByHabit, week.from, week.to]);

  const toggle = useCallback(
    async (habit: Habit) => {
      // Optimistic — flip the set locally, then hit the API.
      const set = completionsByHabit.get(habit.id) ?? new Set<string>();
      const wasOn = set.has(today);
      const optimistic = new Set(set);
      if (wasOn) optimistic.delete(today);
      else optimistic.add(today);
      // Rebuild flat completions from the map so state stays consistent.
      setCompletions((prev) => {
        const others = (prev ?? []).filter((c) => c.habit_id !== habit.id);
        const kept = Array.from(optimistic).map((d) => ({
          id: `${habit.id}:${d}`, // placeholder id — the next refetch replaces it
          habit_id: habit.id,
          user_id: '',
          completed_on: d,
          created_at: new Date().toISOString(),
        })) as HabitCompletion[];
        return [...others, ...kept];
      });
      try {
        await api.toggleCompletion(habit.id, today);
      } catch (e) {
        toast.error('Toggle failed — reverting.');
        await load();
      }
    },
    [completionsByHabit, load, toast, today],
  );

  const submitNew = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.createHabit({
        name: newName.trim(),
        emoji: newEmoji.trim() || undefined,
        target_days_per_week: newTarget,
      });
      setNewName('');
      setNewEmoji('');
      setNewTarget(7);
      setSheetOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Create failed.';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }, [load, newName, newEmoji, newTarget, toast]);

  const removeHabit = useCallback(
    async (h: Habit) => {
      setHabits((prev) => (prev ? prev.filter((x) => x.id !== h.id) : prev));
      try {
        await api.deleteHabit(h.id);
      } catch {
        toast.error('Delete failed — reverting.');
        await load();
      }
    },
    [load, toast],
  );

  const openEdit = useCallback((h: Habit) => {
    setEditing(h);
    setNewName(h.name);
    setNewEmoji(h.emoji ?? '');
    setNewTarget(h.target_days_per_week);
    setSheetOpen(true);
  }, []);

  const openCreate = useCallback(() => {
    setEditing(null);
    setNewName('');
    setNewEmoji('');
    setNewTarget(7);
    setSheetOpen(true);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editing || !newName.trim()) return;
    setCreating(true);
    try {
      await api.updateHabit(editing.id, {
        name: newName.trim(),
        emoji: newEmoji.trim() || null,
        target_days_per_week: newTarget,
      });
      setSheetOpen(false);
      setEditing(null);
      setNewName('');
      setNewEmoji('');
      setNewTarget(7);
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Update failed.';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }, [editing, newName, newEmoji, newTarget, load, toast]);

  const createExample = useCallback(
    async (ex: { name: string; emoji: string }) => {
      setSeedingExample(ex.name);
      try {
        await api.createHabit({
          name: ex.name,
          emoji: ex.emoji,
          target_days_per_week: 7,
        });
        await load();
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Create failed.';
        toast.error(msg);
      } finally {
        setSeedingExample(null);
      }
    },
    [load, toast],
  );

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditing(null);
  }, []);

  const allDone = activeHabits.length > 0 && doneToday === activeHabits.length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-12)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          HABITS · MINI APP
        </span>
      </div>

      {error && (
        <LoadErrorCard
          section="HABITS"
          message={error}
          thingLabel="your habits"
          onReload={() => void load()}
        />
      )}

      {/* THIS WEEK hero */}
      {activeHabits.length > 0 && (
        <PixelCard title="THIS WEEK" meta={week.label}>
          <PixelMetricGrid
            kind="metric_grid"
            negativeDeltaTone="muted"
            items={[
              { label: 'DONE', value: summary.doneThisWeek },
              { label: 'STREAK', value: summary.bestStreak, unit: 'd' },
              { label: 'ACTIVE', value: summary.activeCount },
              { label: 'RATE', value: summary.completionRate, unit: '%' },
            ]}
          />
        </PixelCard>
      )}

      {/* TODAY list */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
            TODAY
          </span>
          <span
            className="data"
            style={{
              color: allDone ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontSize: 'var(--text-caption)',
            }}
          >
            {allDone ? 'ALL DONE ✓' : `${doneToday} / ${activeHabits.length} DONE`}
          </span>
        </div>

        {habits === null ? (
          <p className="caption">Loading…</p>
        ) : activeHabits.length === 0 ? (
          <div style={{ ...CARD_STYLE, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
              NO HABITS YET
            </span>
            <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
              Tap to start with one of these — or make your own below.
            </p>
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
              {EXAMPLE_HABITS.map((ex) => {
                const busy = seedingExample === ex.name;
                return (
                  <li key={ex.name}>
                    <button
                      type="button"
                      onClick={() => void createExample(ex)}
                      disabled={seedingExample !== null}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: '1px solid var(--color-border-visible)',
                        borderRadius: 'var(--radius-card)',
                        padding: 'var(--space-3) var(--space-4)',
                        color: 'inherit',
                        cursor: seedingExample !== null ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        opacity: seedingExample !== null && !busy ? 0.5 : 1,
                        minHeight: 44,
                      }}
                    >
                      <span aria-hidden style={{ fontSize: 18, flexShrink: 0 }}>
                        {ex.emoji}
                      </span>
                      <span
                        style={{
                          color: 'var(--color-text-display)',
                          fontSize: 'var(--text-body)',
                          flex: 1,
                        }}
                      >
                        {ex.name}
                      </span>
                      <span
                        className="data"
                        style={{
                          color: 'var(--color-text-secondary)',
                          fontSize: 'var(--text-caption)',
                          flexShrink: 0,
                        }}
                      >
                        {busy ? 'ADDING…' : '+ ADD'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {activeHabits.map((h) => {
              const set = completionsByHabit.get(h.id) ?? new Set<string>();
              const done = set.has(today);
              const streak = computeStreak(set);
              return (
                <li key={h.id}>
                  <SwipeableRow
                    ariaLabel={h.name}
                    actions={[
                      {
                        label: 'Edit',
                        kind: 'primary',
                        onSelect: () => openEdit(h),
                      },
                      {
                        label: 'Delete',
                        kind: 'destructive',
                        undoLabel: `Deleted "${h.name}"`,
                        onSelect: () => void removeHabit(h),
                      },
                    ]}
                  >
                    <button
                      type="button"
                      onClick={() => void toggle(h)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: `1px solid ${done ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
                        borderRadius: 'var(--radius-card)',
                        padding: 'var(--space-3) var(--space-4)',
                        color: 'inherit',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                      }}
                      aria-pressed={done}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 'var(--radius-compact)',
                          border: `1px solid ${done ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
                          background: done ? 'var(--color-accent)' : 'transparent',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          lineHeight: 1,
                          color: 'var(--color-text-display)',
                          flexShrink: 0,
                        }}
                      >
                        {done ? '✓' : ''}
                      </span>
                      {h.emoji && (
                        <span aria-hidden style={{ fontSize: 18, flexShrink: 0 }}>
                          {h.emoji}
                        </span>
                      )}
                      <span
                        style={{
                          color: 'var(--color-text-display)',
                          fontSize: 'var(--text-body)',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h.name}
                      </span>
                      <span
                        className="data"
                        style={{
                          color: 'var(--color-text-secondary)',
                          fontSize: 'var(--text-caption)',
                          flexShrink: 0,
                        }}
                      >
                        streak: {streak}d
                      </span>
                    </button>
                  </SwipeableRow>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={openCreate}
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            border: '1px solid var(--color-border-visible)',
            color: 'var(--color-text-secondary)',
            borderRadius: 'var(--radius-button)',
            padding: 'var(--space-2) var(--space-4)',
            minHeight: 36,
            cursor: 'pointer',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.06em',
          }}
        >
          + NEW HABIT
        </button>
      </section>

      <BottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        ariaLabel={editing ? 'Edit habit' : 'New habit'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
              {editing ? 'EDIT HABIT' : 'NEW HABIT'}
            </span>
            <h2 className="display-md" style={{ margin: 'var(--space-2) 0 0 0' }}>
              {editing ? 'Tune it up' : 'Build a routine'}
            </h2>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
              NAME
            </span>
            <input
              className="input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 80))}
              placeholder="e.g. Meditate 10 min"
              autoFocus
              style={INPUT_STYLE}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
              EMOJI (OPTIONAL)
            </span>
            <input
              className="input"
              type="text"
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value.slice(0, 4))}
              placeholder="🧘"
              style={{ ...INPUT_STYLE, maxWidth: 100 }}
            />
          </label>

          <div>
            <span className="caption" style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: 'var(--space-2)' }}>
              DAYS PER WEEK
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNewTarget(n)}
                  style={n === newTarget ? CHIP_ACTIVE : CHIP_INACTIVE}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => (editing ? void submitEdit() : void submitNew())}
            disabled={creating || !newName.trim()}
            style={{
              background: creating || !newName.trim() ? 'transparent' : 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              color: 'var(--color-text-display)',
              borderRadius: 'var(--radius-button)',
              padding: 'var(--space-3) var(--space-4)',
              minHeight: 44,
              cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-label)',
              letterSpacing: '0.06em',
              opacity: creating || !newName.trim() ? 0.5 : 1,
            }}
          >
            {creating
              ? editing
                ? 'SAVING…'
                : 'CREATING…'
              : editing
                ? 'SAVE CHANGES'
                : 'CREATE HABIT'}
          </button>
        </div>
      </BottomSheet>

      <a href="/app" style={{ textDecoration: 'none' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          ← BACK TO LAUNCHER
        </span>
      </a>
    </div>
  );
}
