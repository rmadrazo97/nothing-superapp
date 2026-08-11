'use client';

/**
 * Reminders — main view. Handles all three tabs (Upcoming / All / History)
 * with a single fetch backing each. Uses the resource framework's
 * generic REST via `useResource` — the mini-app never talks to Supabase
 * directly.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoadErrorCard, useResource } from '@nothing/mini-apps-runtime';
import type { Reminder, ReminderRun } from '@nothing/shared';
import NewReminderForm from './NewReminderForm.tsx';
import ReminderRow from './ReminderRow.tsx';
import HistoryList from './HistoryList.tsx';
import InfoBanner from './InfoBanner.tsx';

type View = 'upcoming' | 'all' | 'history';

/**
 * v0.5.12: `onRemindersLoaded` lets the page render a THIS WEEK hero data
 * card above the list using the same fetched rows — avoids a duplicate
 * fetch to the same resource endpoint (useResource is not deduped).
 */
export default function RemindersView({
  view,
  onRemindersLoaded,
}: {
  view: View;
  onRemindersLoaded?: (reminders: Reminder[]) => void;
}) {
  const reminders = useResource<Reminder>('reminders', 'reminders', {
    params: { limit: 100 },
    enabled: view === 'upcoming' || view === 'all',
  });
  const runs = useResource<ReminderRun>('reminders', 'runs', {
    params: { limit: 50 },
    enabled: view === 'history',
  });

  const [formOpen, setFormOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = reminders.data ?? [];
    if (view === 'upcoming') return all.filter((r) => r.active);
    return all;
  }, [reminders.data, view]);

  // Hoist the fetched reminders up so the page can render a hero summary
  // above the list without a second GET.
  useEffect(() => {
    if (!onRemindersLoaded) return;
    if (reminders.data) onRemindersLoaded(reminders.data);
  }, [reminders.data, onRemindersLoaded]);

  const onCreate = useCallback(
    async (body: Record<string, unknown>) => {
      await reminders.create(body);
      await reminders.refetch();
      setFormOpen(false);
      setMsg('Reminder saved.');
    },
    [reminders],
  );

  const onToggle = useCallback(
    async (id: string, active: boolean) => {
      await reminders.update(id, { active });
      await reminders.refetch();
    },
    [reminders],
  );

  const onDelete = useCallback(
    async (id: string) => {
      await reminders.remove(id);
      await reminders.refetch();
      setMsg('Reminder deleted.');
    },
    [reminders],
  );

  const onRunNow = useCallback(async (id: string) => {
    setRunning(id);
    setMsg(null);
    try {
      const res = await fetch('/api/reminders/trigger', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_id: id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(`Run failed: ${body.error ?? res.status}`);
      } else {
        setMsg('Fired. Check History for the outcome.');
      }
    } finally {
      setRunning(null);
    }
  }, []);

  if (view === 'history') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {runs.error ? (
          // v0.5.5 lesson 2: don't render "no history yet" when the fetch
          // actually failed — that empty state is indistinguishable from
          // "server 500'd for hours". Surface the error + a RELOAD.
          <LoadErrorCard
            section="HISTORY"
            message={runs.error}
            onReload={() => void runs.refetch()}
          />
        ) : (
          <>
            {runs.isLoading && <Muted>Loading history…</Muted>}
            {!runs.isLoading && (runs.data ?? []).length === 0 && (
              <Muted>No fires yet. Create a reminder to see history here.</Muted>
            )}
            <HistoryList
              runs={runs.data ?? []}
              reminders={reminders.data ?? []}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {msg && (
        <div
          role="status"
          className="caption"
          style={{
            color: 'var(--color-text-secondary)',
            padding: 'var(--space-2) var(--space-3)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          {msg}
        </div>
      )}

      {reminders.error && (
        <LoadErrorCard
          section="REMINDERS"
          message={reminders.error}
          onReload={() => void reminders.refetch()}
        />
      )}

      {/* v0.5.3 (task #107): dashed-outline explainer for the two-in-one
          shape. Persists dismissal per-user via mini-app settings. */}
      <InfoBanner />

      {/* v0.5.1: shrunk from a filled cadmium hero-CTA button to a compact
          ghost variant — the previous size dominated the tab strip.
          v0.5.3 (task #103): tightened further to a chip that mirrors
          calorie-lite's `+ ADD MEAL` — same density, same ghost cadmium,
          same self-align, so the two mini-apps read as one family. */}
      <button
        type="button"
        onClick={() => setFormOpen((o) => !o)}
        style={{
          background: 'transparent',
          color: 'var(--color-accent)',
          border: '1px solid var(--color-accent)',
          padding: 'var(--space-2) var(--space-4)',
          borderRadius: 'var(--radius-button)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-label)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          alignSelf: 'flex-start',
          height: 36,
          lineHeight: 1,
        }}
      >
        {formOpen ? '× CLOSE' : '+ NEW REMINDER'}
      </button>

      {formOpen && <NewReminderForm onSubmit={onCreate} onCancel={() => setFormOpen(false)} />}

      {reminders.isLoading && <Muted>Loading…</Muted>}
      {!reminders.isLoading && !reminders.error && rows.length === 0 && (
        <Muted>No reminders yet. Tap “+ NEW REMINDER” to start.</Muted>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {rows.map((r) => (
          <ReminderRow
            key={r.id}
            reminder={r}
            running={running === r.id}
            onRunNow={() => onRunNow(r.id)}
            onToggle={(active) => onToggle(r.id, active)}
            onDelete={() => onDelete(r.id)}
          />
        ))}
      </div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="caption"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      {children}
    </span>
  );
}

