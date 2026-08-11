'use client';

/**
 * Gym — landing / home for the mini-app.
 *
 * Three surfaces on this screen:
 *   1. Persistent "Resume workout" banner — visible only if the user has a
 *      live session (workout_sessions.ended_at is null). Server checks via
 *      GET /api/mini-apps/gym-routine/sessions/live on mount.
 *   2. Two hero cards — "Start empty" and "Start from routine".
 *   3. Last 3 sessions summary — quick tap through to /history.
 *
 * The mini-app uses the Next segment routes at `/app/gym-routine/*` for
 * navigation (recommended approach in the spec) rather than a client-side
 * router — each sub-page mounts its own re-export of the corresponding
 * `pages/*.tsx` from this package. That gives us clean typedRoutes support
 * and no extra dispatch layer.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyState, useEvents } from '@nothing/mini-apps-runtime';
// Relative reach into the host app — same module instance as the shell's
// <ToastProvider>, so toasts show up in the visible container.
import { useToast } from '../../web/src/lib/toast/context';
import { MiniAppSettingsButton } from '../../web/src/components/mini-apps/MiniAppSettingsButton';
import type { WorkoutRoutine, WorkoutSession } from '@nothing/shared';
import * as api from './lib/api.ts';
import { ApiError, toastForError } from './lib/api.ts';
import {
  cardStyle,
  ghostButtonStyle,
  primaryButtonStyle,
} from './lib/ui.ts';
import {
  toDateLabel,
  totalSetsCompleted,
  durationLabel,
  totalVolumeKg,
} from './lib/format.ts';

export default function GymHomePage() {
  const router = useRouter();
  const events = useEvents();
  void events; // reserved for cross-tab session events in v2

  const [live, setLive] = useState<WorkoutSession | null>(null);
  const [recent, setRecent] = useState<WorkoutSession[] | null>(null);
  const [routines, setRoutines] = useState<WorkoutRoutine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [liveResp, sessionsResp, routinesResp] = await Promise.all([
        api.getLiveSession(),
        api.listSessions(5),
        api.listRoutines(),
      ]);
      setLive(liveResp.session);
      // Filter out live one from the "recent" list to avoid duplication.
      setRecent(sessionsResp.sessions.filter((s) => s.ended_at != null).slice(0, 3));
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
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="label">GYM · ROUTINE</span>
          <h1 className="display-lg" style={{ margin: 0 }}>
            GYM
          </h1>
        </div>
        <MiniAppSettingsButton slug="gym-routine" title="Gym" />
      </div>

      {error && (
        // v0.5.5 lesson 2: pair the message with an explicit RELOAD so a
        // transient network hiccup isn't confused with "no workouts". Skip
        // the button while an early startEmpty() is in flight — the page
        // is about to navigate anyway.
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            padding: 'var(--space-4)',
            border: '1px solid var(--color-warning, var(--color-accent))',
            borderRadius: 'var(--radius-card)',
            background: 'rgba(0, 0, 0, 0.35)',
          }}
        >
          <span
            className="label"
            style={{ color: 'var(--color-warning, var(--color-accent))' }}
          >
            GYM · LOAD FAILED
          </span>
          <span
            className="caption"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {error} Try again?
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={starting}
            style={{ ...ghostButtonStyle, alignSelf: 'flex-start' }}
          >
            RELOAD
          </button>
        </div>
      )}

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
            }}
          >
            <span className="label" style={{ color: 'var(--color-accent)' }}>
              LIVE · IN PROGRESS
            </span>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <span style={{ color: 'var(--color-text-display)', fontSize: 'var(--text-subheading)' }}>
                {live.name ?? 'Untitled session'}
              </span>
              <span className="data" style={{ color: 'var(--color-text-secondary)' }}>
                {durationLabel(live.started_at, null)}
              </span>
            </div>
            <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
              Resume →
            </span>
          </section>
        </Link>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        <button
          type="button"
          onClick={startEmpty}
          disabled={starting}
          style={{
            ...cardStyle,
            textAlign: 'left',
            cursor: starting ? 'wait' : 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            minHeight: 160,
            color: 'inherit',
          }}
        >
          <span className="label">START · EMPTY</span>
          <span className="display-md" style={{ fontFamily: 'var(--font-display)' }}>
            +
          </span>
          <span style={{ color: 'var(--color-text-primary)' }}>
            {starting ? 'Starting…' : 'Log sets as you go. Add exercises on the fly.'}
          </span>
        </button>

        <Link
          href="/app/gym-routine/routines"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <div
            style={{
              ...cardStyle,
              minHeight: 160,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              cursor: 'pointer',
            }}
          >
            <span className="label">START · FROM ROUTINE</span>
            <span className="display-md" style={{ fontFamily: 'var(--font-display)' }}>
              {routines ? routines.length : '·'}
            </span>
            <span style={{ color: 'var(--color-text-primary)' }}>
              {routines && routines.length === 0
                ? 'No routines yet. Build one first.'
                : 'Pick a routine you built earlier.'}
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation strip */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Link href="/app/gym-routine/exercises" style={{ textDecoration: 'none' }}>
          <span style={ghostButtonStyle}>Exercises</span>
        </Link>
        <Link href="/app/gym-routine/routines" style={{ textDecoration: 'none' }}>
          <span style={ghostButtonStyle}>Routines</span>
        </Link>
        <Link href="/app/gym-routine/history" style={{ textDecoration: 'none' }}>
          <span style={ghostButtonStyle}>History</span>
        </Link>
        <Link href="/app/gym-routine/measurements" style={{ textDecoration: 'none' }}>
          <span style={ghostButtonStyle}>Measurements</span>
        </Link>
      </div>

      {/* Recent sessions */}
      <section
        aria-label="Recent sessions"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        <span className="label">RECENT</span>
        {recent === null ? (
          <p className="caption">Loading…</p>
        ) : recent.length === 0 ? (
          <EmptyState
            icon="◈"
            title="No workouts yet"
            body="Start an empty workout, or browse 1,324 exercises to build your first routine."
            primaryAction={{
              label: '+ Start empty',
              onClick: () => void startEmpty(),
              ariaLabel: 'Start an empty workout',
            }}
            secondaryAction={{
              label: 'Browse exercises',
              href: '/app/gym-routine/exercises',
            }}
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {recent.map((s) => (
              <li key={s.id}>
                <div style={{ ...cardStyle, padding: 'var(--space-3) var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--color-text-display)' }}>
                      {s.name ?? 'Untitled session'}
                    </span>
                    <span className="data" style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-caption)' }}>
                      {toDateLabel(s.started_at)}
                    </span>
                  </div>
                  <span
                    className="data"
                    style={{ color: 'var(--color-text-disabled)', fontSize: 'var(--text-caption)' }}
                  >
                    {totalSetsCompleted(s.entries)} sets · {totalVolumeKg(s.entries).toLocaleString()} kg
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {recent && recent.length > 0 && (
          <Link href="/app/gym-routine/history" style={{ textDecoration: 'none' }}>
            <span
              className="caption"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              View all history →
            </span>
          </Link>
        )}
      </section>
    </div>
  );
}
