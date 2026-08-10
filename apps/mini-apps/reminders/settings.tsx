'use client';

/**
 * Reminders — per-mini-app settings drawer.
 *
 * Two things live here:
 *   1. Master toggle for the `reminders` push topic (fan-out is only made
 *      to users whose `preferences.push_topics` contains 'reminders').
 *   2. Clear-all-history button (DELETE runs one-by-one).
 *
 * Refactored to use the shared mini-app settings framework so the visual
 * language matches every other mini-app's settings surface. This one still
 * writes to `preferences` (not `mini_app_settings`) because push topics
 * are cross-app state, not reminders-only state.
 */
import { useEffect, useState } from 'react';
import { usePreferences } from '@nothing/mini-apps-runtime';
import {
  MiniAppSettingsPanel,
  SettingsSection,
  SettingsToggle,
  SettingsButton,
} from '../../web/src/components/mini-app-settings';

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
    <MiniAppSettingsPanel name="Reminders and Tasks" onBack={onClose}>
      <SettingsSection number={1} title="Notifications">
        <SettingsToggle
          label="Push me reminder outcomes"
          helper="When off, reminders still fire (agent loops still run + history is logged) but you won't get a push notification. Global push must be enabled in the main app Settings."
          checked={enabled}
          onChange={setEnabled}
          disabled={busy}
        />
        <SettingsButton
          type="button"
          variant="primary"
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? 'Saving…' : 'Save'}
        </SettingsButton>
        {msg && (
          <p
            role="status"
            style={{
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {msg}
          </p>
        )}
      </SettingsSection>

      <SettingsSection
        number={2}
        title="History"
        description="Wipes every logged reminder run for your account. There is no undo."
      >
        <SettingsButton
          type="button"
          variant="accent-ghost"
          onClick={() => void clearHistory()}
          disabled={busy}
        >
          Clear history
        </SettingsButton>
      </SettingsSection>
    </MiniAppSettingsPanel>
  );
}
