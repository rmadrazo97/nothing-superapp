'use client';

import { useState } from 'react';
import type { Reminder, ReminderRun } from '@nothing/shared';

export default function HistoryList({
  runs,
  reminders,
}: {
  runs: ReminderRun[];
  reminders: Reminder[];
}) {
  const titleFor = (rid: string) =>
    reminders.find((r) => r.id === rid)?.title ?? '(deleted reminder)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {runs.map((run) => (
        <HistoryRow key={run.id} run={run} title={titleFor(run.reminder_id)} />
      ))}
    </div>
  );
}

function HistoryRow({ run, title }: { run: ReminderRun; title: string }) {
  const [open, setOpen] = useState(false);
  const isAgent = run.kind === 'agent_loop';
  const hasSummary = isAgent && Boolean(run.agent_summary);
  const statusColor =
    run.status === 'ok'
      ? 'var(--color-text-secondary)'
      : run.status === 'error'
        ? 'var(--color-accent)'
        : 'var(--color-text-secondary)';

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-3) var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            className="body"
            style={{ color: 'var(--color-text-display)', fontFamily: 'var(--font-body)' }}
          >
            {title}
          </span>
          <span
            className="caption"
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.04em',
            }}
          >
            {new Date(run.fired_at).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {' · '}
            {isAgent ? 'AGENT' : 'NOTIFY'}
          </span>
        </div>
        <span
          className="label"
          style={{
            color: statusColor,
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {run.status}
        </span>
      </div>

      {run.error_message && (
        <span
          className="caption"
          style={{
            color: 'var(--color-accent)',
            fontSize: 'var(--text-caption)',
          }}
        >
          {run.error_message}
        </span>
      )}

      {hasSummary && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--color-text-secondary)',
              textAlign: 'left',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {open ? '▲ Hide summary' : '▼ Show summary'}
          </button>
          {open && (
            <p
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-body)',
                color: 'var(--color-text-display)',
                margin: 0,
                fontSize: 'var(--text-body)',
              }}
            >
              {run.agent_summary}
            </p>
          )}
        </>
      )}
    </div>
  );
}
