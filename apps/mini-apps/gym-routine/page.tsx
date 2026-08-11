'use client';

/**
 * Gym — home / landing (v0.5.12 redesign · direction A).
 *
 * Stack top → bottom:
 *   1. Compact header ("GYM · MINI APP" kicker + ⚙).
 *   2. LIVE · IN PROGRESS card — ONLY when a live session exists.
 *   3. THIS WEEK — hero data card dogfooding PixelUI:
 *      - `<PixelBarChart>` of daily volume Mon → Sun for the current week.
 *      - `<PixelMetricGrid>` with 4 KPIs (Volume · Sets · Sessions · Streak).
 *      Wrapped in a `<PixelCard>` so it inherits the 2×2 cadmium LED signature.
 *   4. Two START CTAs (EMPTY / FROM ROUTINE) as compact side-by-side buttons.
 *   5. ROUTINES — horizontal-scroll carousel of saved routines.
 *   6. RECENT — one-line-per-session compact list, tap → session detail.
 *   7. Secondary nav row (EXERCISES · MEASUREMENTS · PROGRESSION) as small chips.
 *
 * Kills the previous "GYM" giant Doto title + two-column START cards + 5-pill
 * nav that wrapped two lines. Feedback: "this UI is bad" (user, v0.5.11
 * screenshot). Reference direction from three fitness-app mockups the user
 * shared — filtered through Nothing OS tokens (no color images, no round-
 * corner bright hero cards; Doto numerals + cadmium accent + PixelCard shell).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoadErrorCard, useEvents } from '@nothing/mini-apps-runtime';
import { useToast } from '../../web/src/lib/toast/context';
import { MiniAppSettingsButton } from '../../web/src/components/mini-apps/MiniAppSettingsButton';
import { PixelBarChart, PixelCard, PixelMetricGrid } from '../../web/src/components/pixel-ui';
import type { WorkoutRoutine, WorkoutSession } from '@nothing/shared';
import * as api from './lib/api.ts';
import { ApiError, toastForError } from './lib/api.ts';
import { cardStyle, ghostButtonStyle } from './lib/ui.ts';
import { toDateLabel, durationLabel, totalSetsCompleted, totalVolumeKg } from './lib/format.ts';
import { weekSummary } from './lib/week-summary.ts';

export default function GymHomePage() {
  const router = useRouter();
  const events = useEvents();
  void events; // reserved for cross-tab session events in v2

  const [live, setLive] = useState<WorkoutSession | null>(null);
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [routines, setRoutines] = useState<WorkoutRoutine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [liveResp, sessionsResp, routinesResp] = await Promise.all([
        api.getLiveSession(),
        api.listSessions(50), // 50 = plenty for weekSummary + 3 recent
        api.listRoutines(),
      ]);
      setLive(liveResp.session);
      setSessions(sessionsResp.sessions);
      setRoutines(routinesResp.routines);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 402) setError('Subscription required.');
        else if (e.status === 401) setError('Session expired. Sign in again.');
        else setError('Could not load workouts.');
      } else {
        setError('Network error.');
      }
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEmpty = async () => {
    setStarting(true);
    setError(null);
    try {
      const { session } = await api.createSession({ name: null, entries: [] });
      try {
        sessionStorage.setItem('gym-routine.sessionId', session.id);
      } catch {
        /* private mode — non-fatal */
      }
      router.push(`/app/gym-routine/session/${session.id}`);
    } catch (e) {
      setStarting(false);
      setError(e instanceof ApiError ? e.message : 'Could not start session.');
      const t = toastForError(e);
      if (t) toast[t.variant](t.message);
    }
  };

  // Derive THIS WEEK summary from the fetched sessions.
  const summary = useMemo(() => (sessions ? weekSummary(sessions) : null), [sessions]);

  const recent = useMemo(() => {
    if (!sessions) return null;
    return sessions.filter((s) => s.ended_at != null).slice(0, 3);
  }, [sessions]);

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
      {/* Header — compact kicker + settings. No giant "GYM" title. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          GYM · MINI APP
        </span>
        <MiniAppSettingsButton slug="gym-routine" title="Gym" />
      </div>

      {error && (
        <LoadErrorCard
          section="GYM"
          message={error}
          thingLabel="your workouts"
          onReload={() => void load()}
        />
      )}

      {/* LIVE — only when a session is in progress */}
      {live && (
        <Link
          href={`/app/gym-routine/session/${live.id}`}
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <section
            aria-label="Live workout"
            style={{
              ...cardStyle,
              borderColor: 'var(--color-accent)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              cursor: 'pointer',
              padding: 'var(--space-4)',
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
              <span className="label" style={{ color: 'var(--color-accent)' }}>
                LIVE · IN PROGRESS
              </span>
              <span className="data" style={{ color: 'var(--color-text-secondary)' }}>
                {durationLabel(live.started_at, null)}
              </span>
            </div>
            <span
              style={{
                color: 'var(--color-text-display)',
                fontSize: 'var(--text-body)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {live.name ?? 'Untitled session'}
            </span>
            <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
              RESUME →
            </span>
          </section>
        </Link>
      )}

      {/* THIS WEEK — hero data card, PixelUI dogfood */}
      {summary && !summary.isEmpty && (
        <PixelCard title="THIS WEEK" meta={weekMetaLabel()}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <PixelBarChart
              kind="bar_chart"
              xLabels={summary.volume_by_day.map((b) => b.label)}
              series={[{ label: 'Volume', values: summary.volume_by_day.map((b) => b.kg) }]}
              units="kg"
            />
            <PixelMetricGrid
              kind="metric_grid"
              negativeDeltaTone="muted"
              items={[
                {
                  label: 'Volume',
                  unit: 'kg',
                  value: summary.kpis.volume_kg.current,
                  delta: summary.kpis.volume_kg.delta || undefined,
                },
                {
                  label: 'Sets',
                  value: summary.kpis.sets.current,
                  delta: summary.kpis.sets.delta || undefined,
                },
                {
                  label: 'Sessions',
                  value: summary.kpis.sessions.current,
                  delta: summary.kpis.sessions.delta || undefined,
                },
                {
                  label: 'Streak',
                  unit: 'd',
                  value: summary.kpis.streak.current,
                },
              ]}
            />
          </div>
        </PixelCard>
      )}

      {/* START — compact side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={startEmpty}
          disabled={starting}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-card)',
            padding: 'var(--space-4) var(--space-3)',
            cursor: starting ? 'wait' : 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 'var(--space-2)',
            color: 'inherit',
            minHeight: 72,
          }}
        >
          <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
            + EMPTY
          </span>
          <span style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-body)' }}>
            {starting ? 'Starting…' : 'Log sets on the fly'}
          </span>
        </button>

        <Link
          href="/app/gym-routine/routines"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <div
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-card)',
              padding: 'var(--space-4) var(--space-3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 'var(--space-2)',
              cursor: 'pointer',
              minHeight: 72,
            }}
          >
            <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
              ▶ FROM ROUTINE
            </span>
            <span style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-body)' }}>
              {routines && routines.length === 0 ? 'Build one first' : 'Pick a saved routine'}
            </span>
          </div>
        </Link>
      </div>

      {/* ROUTINES — horizontal-scroll carousel */}
      {routines && routines.length > 0 && (
        <section aria-label="Saved routines" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="label" style={{ color: 'var(--color-text-secondary)' }}>ROUTINES</span>
            <Link href="/app/gym-routine/routines" style={{ textDecoration: 'none' }}>
              <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>ALL →</span>
            </Link>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              overflowX: 'auto',
              paddingBottom: 'var(--space-2)',
              // Hide scrollbar on WebKit for the pill-strip look
              scrollbarWidth: 'none',
            }}
          >
            {routines.slice(0, 8).map((r) => (
              <Link
                key={r.id}
                href="/app/gym-routine/routines"
                style={{ textDecoration: 'none', color: 'inherit', flexShrink: 0 }}
              >
                <div
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border-visible)',
                    borderRadius: 'var(--radius-card)',
                    padding: 'var(--space-3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-1)',
                    minWidth: 200,
                    maxWidth: 240,
                  }}
                >
                  <span
                    style={{
                      color: 'var(--color-text-display)',
                      fontSize: 'var(--text-body)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.name}
                  </span>
                  <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
                    {routineSummary(r)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* RECENT — compact one-line list */}
      <section aria-label="Recent sessions" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="label" style={{ color: 'var(--color-text-secondary)' }}>RECENT</span>
          {recent && recent.length > 0 && (
            <Link href="/app/gym-routine/history" style={{ textDecoration: 'none' }}>
              <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>HISTORY →</span>
            </Link>
          )}
        </div>
        {recent === null ? (
          <p className="caption">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="caption" style={{ color: 'var(--color-text-secondary)' }}>
            No sessions yet — hit + EMPTY or start a routine.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {recent.map((s, idx) => {
              const setsN = totalSetsCompleted(s.entries);
              const volN = totalVolumeKg(s.entries);
              const isEmpty = setsN === 0 && volN === 0;
              return (
                <li
                  key={s.id}
                  style={{
                    borderBottom: idx < recent.length - 1 ? '1px solid var(--color-border)' : 'none',
                    padding: 'var(--space-2) 0',
                  }}
                >
                  <Link
                    href={`/app/gym-routine/session/${s.id}`}
                    style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}
                  >
                    <span
                      aria-hidden
                      style={{
                        color: isEmpty ? 'var(--color-text-disabled)' : 'var(--color-accent)',
                        fontSize: 10,
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      {isEmpty ? '○' : '●'}
                    </span>
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
                      {s.name ?? 'Untitled session'}
                    </span>
                    <span
                      className="data"
                      style={{
                        color: 'var(--color-text-secondary)',
                        fontSize: 'var(--text-caption)',
                        flexShrink: 0,
                      }}
                    >
                      {isEmpty
                        ? 'empty'
                        : `${setsN} · ${volN.toLocaleString()}kg`}
                    </span>
                    <span
                      className="data"
                      style={{
                        color: 'var(--color-text-disabled)',
                        fontSize: 'var(--text-caption)',
                        flexShrink: 0,
                      }}
                    >
                      {toDateLabel(s.started_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Secondary nav — small chip row */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Link href="/app/gym-routine/exercises" style={{ textDecoration: 'none' }}>
          <span style={smallChipStyle}>EXERCISES</span>
        </Link>
        <Link href="/app/gym-routine/measurements" style={{ textDecoration: 'none' }}>
          <span style={smallChipStyle}>MEASUREMENTS</span>
        </Link>
        <Link href="/app/gym-routine/progression" style={{ textDecoration: 'none' }}>
          <span style={smallChipStyle}>PROGRESSION</span>
        </Link>
      </div>
    </div>
  );
}

// ── local helpers ────────────────────────────────────────────────────────────

const smallChipStyle = {
  ...ghostButtonStyle,
  padding: 'var(--space-2) var(--space-3)',
  minHeight: 32,
  fontSize: 'var(--text-caption)',
  color: 'var(--color-text-secondary)',
};

function weekMetaLabel(now: Date = new Date()): string {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
  return `${fmt(monday)} → ${fmt(sunday)}`;
}

function routineSummary(r: WorkoutRoutine): string {
  const plan = (r as unknown as { plan?: { days?: Array<{ exercises?: unknown[] }> } }).plan;
  if (plan && Array.isArray(plan.days) && plan.days.length > 0) {
    const exCount = plan.days.reduce(
      (n, d) => n + (Array.isArray(d.exercises) ? d.exercises.length : 0),
      0,
    );
    return `${plan.days.length} DAY${plan.days.length === 1 ? '' : 'S'} · ${exCount} EX`;
  }
  const exN = r.exercises.length;
  const setsN = r.exercises.reduce((s, e) => s + e.sets.length, 0);
  return `${exN} EX · ${setsN} SETS`;
}
