'use client';

/**
 * Reminders — mini-app page (scaffold shell).
 *
 * v0 shell: renders a header + a placeholder while the full UI ships in
 * a follow-up slice. Uses the shared design tokens, no hex, respects the
 * space scale (no --space-5).
 */
import { useState } from 'react';
import RemindersView from './components/RemindersView.tsx';

type View = 'upcoming' | 'all' | 'history';

export default function RemindersPage() {
  const [view, setView] = useState<View>('upcoming');
  return (
    // v0.5.3 (task #103): the content was rendering in a narrow left-anchored
    // column with a big empty right gutter — the shell already caps width,
    // but the inner column has no max-width so on mid-sized viewports it
    // stretched arbitrarily. Center at 480px so the tab strip + CTA + list
    // read as one unit like the other mini-apps.
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
      <RemindersView view={view} />
    </div>
  );
}

function Header({
  view,
  onChangeView,
}: {
  view: View;
  onChangeView: (v: View) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">REMINDERS AND TASKS</span>
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
        <TabButton active={view === 'upcoming'} onClick={() => onChangeView('upcoming')}>
          Upcoming
        </TabButton>
        <TabButton active={view === 'all'} onClick={() => onChangeView('all')}>
          All
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
