'use client';

/**
 * Reminders — per-mini-app settings drawer.
 *
 * Two things live here:
 *   1. Master toggle for the `reminders` push topic (fan-out is only made
 *      to users whose `preferences.push_topics` contains 'reminders').
 *   2. Clear-all-history button (DELETE runs one-by-one).
 */
import { useEffect, useState } from 'react';
import { usePreferences } from '@nothing/mini-apps-runtime';

export default function RemindersSettings({ onClose }: { onClose: () => void }) {
  const preferences = usePreferences();
  const [enabled, setEnabled] = useState<boolean>(
    Array.isArray(preferences?.push_topics)
      ? preferences.push_topics.includes('reminders')
      : true,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (Array.isArray(preferences?.push_topics)) {
      setEnabled(preferences.push_topics.includes('reminders'));
    }
  }, [preferences?.push_topics]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const current: string[] = Array.isArray(preferences?.push_topics)
        ? [...preferences.push_topics]
        : ['releases'];
      const next = new Set(current);
      if (enabled) next.add('reminders');
      else next.delete('reminders');
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ push_topics: Array.from(next) }),
      });
      if (!res.ok) throw new Error(`preferences_${res.status}`);
      setMsg('Saved.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'save_failed');
    } finally {
      setBusy(false);
    }
  };

  const clearHistory = async () => {
    if (!confirm('Clear all reminder history? This is irreversible.')) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/mini-apps/reminders/resources/runs?limit=500', {
        credentials: 'same-origin',
      });
      const body = (await res.json()) as { rows?: Array<{ id: string }> };
      const rows = body.rows ?? [];
      for (const r of rows) {
        await fetch(
          `/api/mini-apps/reminders/resources/runs/${encodeURIComponent(r.id)}`,
          { method: 'DELETE', credentials: 'same-origin' },
        );
      }
      setMsg(`Cleared ${rows.length} runs.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'clear_failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-4)' }}>
      <label style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span
          className="body"
          style={{ color: 'var(--color-text-display)', fontFamily: 'var(--font-body)' }}
        >
          Push me reminder outcomes
        </span>
      </label>

      <span
        className="caption"
        style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-caption)' }}
      >
        When off, reminders still fire (agent loops still run + history is
        logged) but you won't get a push notification. Global push must be
        enabled in the main app Settings.
      </span>

      <button
        type="button"
        onClick={save}
        disabled={busy}
        style={{
          background: 'var(--color-accent)',
          color: 'var(--color-on-accent, #000)',
          border: 0,
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-button)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-label)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.5 : 1,
          alignSelf: 'flex-start',
        }}
      >
        Save
      </button>

      <div style={{ height: 1, background: 'var(--color-border)' }} />

      <button
        type="button"
        onClick={clearHistory}
        disabled={busy}
        style={{
          background: 'transparent',
          border: '1px solid var(--color-border-visible)',
          color: 'var(--color-text-secondary)',
          padding: 'var(--space-2) var(--space-3)',
          borderRadius: 'var(--radius-button)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-caption)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: busy ? 'default' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        Clear history
      </button>

      {msg && (
        <span
          className="caption"
          style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-caption)' }}
        >
          {msg}
        </span>
      )}

      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 0,
          color: 'var(--color-text-secondary)',
          padding: 0,
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-caption)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        Close
      </button>
    </div>
  );
}
