'use client';

/**
 * Push notifications sub-surface for Settings → Preferences.
 *
 * States:
 *   - Unsupported browser: informational line, no controls.
 *   - Not opted in: "Push notifications: OFF" + [TURN ON] button.
 *   - Opted in: topic checkboxes (releases, insights) + [SEND TEST] +
 *     [TURN OFF] link.
 *
 * Hits `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/test`,
 * and `/api/preferences` (PATCH push_topics). All tokens sourced from the
 * design system — no hex, space scale skips 5 + 7.
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useToast } from '@/lib/toast/context';
import {
  currentPermission,
  disablePush,
  enablePush,
  isPushSupported,
} from './push-client';
import type { PushTopic } from '@nothing/shared';

const AVAILABLE_TOPICS: { slug: PushTopic; label: string; blurb: string }[] = [
  {
    slug: 'releases',
    label: 'Releases',
    blurb: 'A note each time we ship a new version.',
  },
  {
    slug: 'insights',
    label: 'Insights',
    blurb: 'Occasional personalized nudges from your data.',
  },
];

const FIELD_LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
};

const STATUS_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body-sm)',
  color: 'var(--color-text-secondary)',
};

const HINT_STYLE: CSSProperties = {
  ...STATUS_STYLE,
  fontSize: 'var(--text-caption)',
  color: 'var(--color-text-disabled)',
};

const PRIMARY_BTN_STYLE: CSSProperties = {
  padding: 'var(--space-3) var(--space-6)',
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  border: 'none',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-label)',
  fontWeight: 500,
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: '44px',
  alignSelf: 'flex-start',
};

const SECONDARY_BTN_STYLE: CSSProperties = {
  padding: 'var(--space-3) var(--space-6)',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-button)',
  fontFamily: 'var(--font-label)',
  fontWeight: 500,
  fontSize: 'var(--text-body-sm)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  minHeight: '44px',
  alignSelf: 'flex-start',
};

type PushState = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  enabled: boolean;
  topics: PushTopic[];
};

export function PushSettingsSection({
  initialEnabled,
  initialTopics,
}: {
  initialEnabled: boolean;
  initialTopics: PushTopic[];
}) {
  const [state, setState] = useState<PushState>({
    supported: true,
    permission: 'default',
    enabled: initialEnabled,
    topics: initialTopics.length > 0 ? initialTopics : ['releases'],
  });
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = isPushSupported();
      const permission = await currentPermission();
      if (cancelled) return;
      setState((s) => ({ ...s, supported, permission }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onTurnOn = useCallback(async () => {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      toast.success('Notifications on.');
      setState((s) => ({ ...s, enabled: true, permission: 'granted' }));
    } else if (result.reason === 'denied') {
      toast.error('Permission blocked. Turn it back on in your browser settings.');
      setState((s) => ({ ...s, permission: 'denied' }));
    } else if (result.reason === 'unsupported') {
      toast.error('This browser does not support push notifications.');
    } else {
      toast.error(`Could not enable — ${result.message ?? 'try again'}`);
    }
  }, [toast]);

  const onTurnOff = useCallback(async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setState((s) => ({ ...s, enabled: false }));
    toast.success('Notifications off.');
  }, [toast]);

  const onToggleTopic = useCallback(
    async (topic: PushTopic, next: boolean) => {
      const nextTopics = next
        ? Array.from(new Set([...state.topics, topic]))
        : state.topics.filter((t) => t !== topic);
      setState((s) => ({ ...s, topics: nextTopics }));
      try {
        const res = await fetch('/api/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ push_topics: nextTopics }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        toast.error(
          `Could not save topic — ${err instanceof Error ? err.message : 'try again'}`,
        );
        // Revert on failure so UI matches server.
        setState((s) => ({ ...s, topics: state.topics }));
      }
    },
    [state.topics, toast],
  );

  const onSendTest = useCallback(async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { sent?: number };
      const n = body.sent ?? 0;
      if (n > 0) toast.success(`Test sent to ${n} ${n === 1 ? 'device' : 'devices'}.`);
      else toast.error('No active subscriptions found. Try turning on again.');
    } catch (err) {
      toast.error(
        `Could not send test — ${err instanceof Error ? err.message : 'try again'}`,
      );
    } finally {
      setTesting(false);
    }
  }, [toast]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <span style={FIELD_LABEL_STYLE}>Push notifications</span>
        <span style={HINT_STYLE}>
          Delivered even when the tab is closed. Release notes today, personalized
          insights later.
        </span>
      </div>

      {!state.supported ? (
        <p style={STATUS_STYLE}>
          This browser does not support push notifications. Add the app to your home
          screen and try again.
        </p>
      ) : state.permission === 'denied' ? (
        <p style={STATUS_STYLE}>
          Permission blocked in your browser. Turn it back on in your site settings,
          then reload.
        </p>
      ) : !state.enabled ? (
        <>
          <p style={STATUS_STYLE}>
            Status:{' '}
            <span
              className="data"
              style={{ color: 'var(--color-text-display)' }}
            >
              OFF
            </span>
          </p>
          <button
            type="button"
            onClick={onTurnOn}
            disabled={busy}
            style={{ ...PRIMARY_BTN_STYLE, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Turning on…' : 'Turn on'}
          </button>
        </>
      ) : (
        <>
          <p style={STATUS_STYLE}>
            Status:{' '}
            <span
              className="data"
              style={{ color: 'var(--color-text-display)' }}
            >
              ON
            </span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {AVAILABLE_TOPICS.map((topic) => {
              const checked = state.topics.includes(topic.slug);
              return (
                <label
                  key={topic.slug}
                  htmlFor={`push-topic-${topic.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 'var(--space-4)',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-label)',
                        fontSize: 'var(--text-body-sm)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {topic.label}
                    </span>
                    <span style={HINT_STYLE}>{topic.blurb}</span>
                  </span>
                  <input
                    id={`push-topic-${topic.slug}`}
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onToggleTopic(topic.slug, e.target.checked)}
                    style={{
                      width: '20px',
                      height: '20px',
                      accentColor: 'var(--color-accent)',
                      cursor: 'pointer',
                      marginTop: '2px',
                    }}
                  />
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onSendTest}
              disabled={testing}
              style={{ ...SECONDARY_BTN_STYLE, opacity: testing ? 0.6 : 1 }}
            >
              {testing ? 'Sending…' : 'Send test'}
            </button>
            <button
              type="button"
              onClick={onTurnOff}
              disabled={busy}
              style={{ ...SECONDARY_BTN_STYLE, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Turning off…' : 'Turn off'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
