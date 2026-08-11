'use client';

/**
 * Reminders — mini-app home (v0.5.12 redesign · instrument-panel direction).
 *
 * Stack top → bottom:
 *   1. Compact header — "REMINDERS · MINI APP" kicker + view tab strip.
 *   2. THIS WEEK — hero data card dogfooding PixelUI:
 *      - `<PixelBarChart>` of daily fire counts Mon → Sun for the current week.
 *      - `<PixelMetricGrid>` with 4 KPIs (Active · This Week · Tasks · Next Fire).
 *      Rendered ONLY on the Upcoming/All tabs, and ONLY when reminders exist.
 *   3. `<RemindersView>` — the existing list surface (banner, +NEW REMINDER
 *      chip, LoadErrorCard error UX, row list with swipe-to-delete). The view
 *      hoists its fetched reminders back up so the hero uses the same data
 *      (no double GET).
 *
 * Mirrors the shape landed for Gym in v0.5.11/v0.5.12 (SHA 9bac189). Same
 * PixelCard shell, same 2×2 cadmium LED signature, same negativeDeltaTone=muted
 * so the delta chips don't collide with the LED cluster.
 */
import { useCallback, useMemo, useState } from 'react';
import type { Reminder } from '@nothing/shared';
import RemindersView from './components/RemindersView.tsx';
import {
  PixelBarChart,
  PixelCard,
  PixelMetricGrid,
} from '../../web/src/components/pixel-ui';
import {
  nextFireRelative,
  remindersWeekSummary,
} from './lib/week-summary.ts';

type View = 'upcoming' | 'all' | 'history';

export default function RemindersPage() {
  const [view, setView] = useState<View>('upcoming');
  const [reminders, setReminders] = useState<Reminder[] | null>(null);

  // Stable callback so RemindersView's effect doesn't re-fire every render.
  const onRemindersLoaded = useCallback((rows: Reminder[]) => {
    setReminders(rows);
  }, []);

  const summary = useMemo(
    () => (reminders ? remindersWeekSummary(reminders) : null),
    [reminders],
  );

  // Only show the hero on tabs that render the list (Upcoming / All). The
  // History tab is a different surface (past runs) and its own KPIs belong
  // there in a later slice.
  const showHero =
    view !== 'history' && summary !== null && !summary.isEmpty;

  return (
    // Content stays capped at 480 (v0.5.3 fix) so the list, banner, and now
    // the hero card read as one instrument panel on mid-sized viewports.
    <div
      style={{
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-12)',
      }}
    >
      <Header view={view} onChangeView={setView} />

      {showHero && summary && (
        <PixelCard title="THIS WEEK" meta={weekMetaLabel()}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            <PixelBarChart
              kind="bar_chart"
              xLabels={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
              series={[{ label: 'Fires', values: summary.fires_by_day }]}
              units=""
            />
            <PixelMetricGrid
              kind="metric_grid"
              negativeDeltaTone="muted"
              items={buildMetricItems(summary)}
            />
          </div>
        </PixelCard>
      )}

      <RemindersView view={view} onRemindersLoaded={onRemindersLoaded} />
    </div>
  );
}

// ─── metric grid items ──────────────────────────────────────────────────────

function buildMetricItems(summary: ReturnType<typeof remindersWeekSummary>) {
  const next = nextFireRelative(summary.next_fire_at);
  return [
    { label: 'ACTIVE', value: summary.active_count },
    { label: 'THIS WEEK', value: summary.fires_this_week },
    { label: 'TASKS', value: summary.agent_loop_count },
    { label: 'NEXT FIRE', value: next.value, unit: next.unit },
  ];
}

// ─── week label — "AUG 5 → AUG 11" style ────────────────────────────────────

function weekMetaLabel(now: Date = new Date()): string {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (d: Date) =>
    d
      .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      .toUpperCase();
  return `${fmt(monday)} → ${fmt(sunday)}`;
}

// ─── header (kicker + view tab strip) ───────────────────────────────────────

function Header({
  view,
  onChangeView,
}: {
  view: View;
  onChangeView: (v: View) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          className="label"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          REMINDERS · MINI APP
        </span>
      </div>
      <div
        role="tablist"
        aria-label="Reminders views"
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <TabButton
          active={view === 'upcoming'}
          onClick={() => onChangeView('upcoming')}
        >
          Upcoming
        </TabButton>
        <TabButton active={view === 'all'} onClick={() => onChangeView('all')}>
          All
        </TabButton>
        <TabButton
          active={view === 'history'}
          onClick={() => onChangeView('history')}
        >
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
        color: active
          ? 'var(--color-text-display)'
          : 'var(--color-text-secondary)',
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
