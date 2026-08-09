'use client';

import { useState } from 'react';
import type { Reminder } from '@nothing/shared';
import { describeSchedule } from '../lib/describe.ts';

interface Props {
  reminder: Reminder;
  running: boolean;
  onRunNow: () => void;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
}

export default function ReminderRow({
  reminder,
  running,
  onRunNow,
  onToggle,
  onDelete,
}: Props) {
  const [confirm, setConfirm] = useState(false);
  const isAgent = reminder.kind === 'agent_loop';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-3) var(--space-4)',
        opacity: reminder.active ? 1 : 0.5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'baseline' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <span
            className="body"
            style={{
              color: 'var(--color-text-display)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {reminder.title}
          </span>
          <span
            className="caption"
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.04em',
            }}
          >
            {describeSchedule(reminder)}
          </span>
        </div>
        <Chip tone={isAgent ? 'accent' : 'muted'}>
          {isAgent ? '◐ AGENT' : 'NOTIFY'}
        </Chip>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <MiniButton onClick={onRunNow} disabled={running}>
          {running ? 'Running…' : '▶ Run now'}
        </MiniButton>
        <MiniButton onClick={() => onToggle(!reminder.active)}>
          {reminder.active ? 'Pause' : 'Resume'}
        </MiniButton>
        {!confirm ? (
          <MiniButton onClick={() => setConfirm(true)}>× Delete</MiniButton>
        ) : (
          <>
            <MiniButton tone="accent" onClick={onDelete}>Confirm</MiniButton>
            <MiniButton onClick={() => setConfirm(false)}>Cancel</MiniButton>
          </>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'accent' | 'muted';
}) {
  return (
    <span
      className="label"
      style={{
        fontSize: 'var(--text-caption)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: tone === 'accent' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        border: `1px solid ${tone === 'accent' ? 'var(--color-accent)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-button)',
        padding: '2px var(--space-2)',
      }}
    >
      {children}
    </span>
  );
}

function MiniButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'accent';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        border: `1px solid ${tone === 'accent' ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
        color: tone === 'accent' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        padding: 'var(--space-1) var(--space-3)',
        borderRadius: 'var(--radius-button)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-caption)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
