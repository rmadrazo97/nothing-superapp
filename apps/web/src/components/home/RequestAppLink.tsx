'use client';

/**
 * RequestAppLink — dashed-outline "REQUEST AN APP →" strip at the bottom
 * of the launcher. Opens a modal with a small textarea + submit. Follows
 * the FirstRunHint dashed-border treatment so the affordance reads as
 * "instrument panel", not another tile.
 *
 * On submit we POST to `/api/app-requests`. Confirmation state renders
 * inline ("Thanks — noted. Alex reviews these weekly.") for 4s then the
 * modal auto-closes and the link goes back to its default label.
 *
 * All styling via design-system tokens. No hex, no emoji beyond the
 * cadmium `→` chevron.
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

const MAX_LEN = 500;

export function RequestAppLink() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          appearance: 'none',
          background: 'transparent',
          border: '1px dashed var(--color-border-visible)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-4) var(--space-6)',
          color: 'var(--color-text-secondary)',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-label)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <span>Request an app</span>
        <span aria-hidden="true" style={{ color: 'var(--color-accent)' }}>
          →
        </span>
      </button>

      {open ? <RequestAppModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-4)',
};

const CARD: CSSProperties = {
  width: '100%',
  maxWidth: 440,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

function RequestAppModal({ onClose }: { onClose: () => void }) {
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // Auto-close 4s after a successful send so the user sees the "noted"
  // confirmation but doesn't have to manually dismiss.
  useEffect(() => {
    if (status.kind !== 'sent') return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [status.kind, onClose]);

  // Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setStatus({ kind: 'sending' });
    try {
      const res = await fetch('/api/app-requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (res.status === 429) {
          setStatus({
            kind: 'error',
            message:
              err.message ?? 'Too many requests today. Try again tomorrow.',
          });
        } else if (res.status === 401) {
          setStatus({ kind: 'error', message: 'Please sign in first.' });
        } else {
          setStatus({
            kind: 'error',
            message: err.message ?? 'Could not send. Try again in a moment.',
          });
        }
        return;
      }
      setStatus({ kind: 'sent' });
    } catch {
      setStatus({
        kind: 'error',
        message: 'Network error — please try again.',
      });
    }
  }, [body]);

  const disabled =
    status.kind === 'sending' || status.kind === 'sent' || body.trim().length === 0;

  return (
    <div
      style={OVERLAY}
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-app-title"
      onClick={(e) => {
        // Backdrop click closes; taps inside the card do not bubble here.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={CARD}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <p className="label" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
              REQUEST AN APP
            </p>
            <h2
              id="request-app-title"
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-heading)',
                color: 'var(--color-text-display)',
                letterSpacing: '-0.01em',
              }}
            >
              What should we build?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              padding: 'var(--space-2)',
            }}
          >
            ×
          </button>
        </header>

        {status.kind === 'sent' ? (
          <p
            role="status"
            style={{
              margin: 0,
              padding: 'var(--space-4)',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-compact)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body-sm)',
              lineHeight: 1.5,
            }}
          >
            Thanks — noted. Alex reviews these weekly.
          </p>
        ) : (
          <>
            <label
              htmlFor="request-app-body"
              style={{
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
              }}
            >
              Your ask
            </label>
            <textarea
              id="request-app-body"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
              placeholder="Photo diary, budget tracker, sleep coach…"
              rows={4}
              disabled={status.kind === 'sending'}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border-visible)',
                borderRadius: 'var(--radius-compact)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body)',
                lineHeight: 1.4,
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 'var(--space-3)',
              }}
            >
              <span
                className="caption"
                style={{ color: 'var(--color-text-disabled)' }}
                aria-live="polite"
              >
                {body.length} / {MAX_LEN}
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={disabled}
                style={{
                  padding: 'var(--space-3) var(--space-6)',
                  background: 'var(--color-accent)',
                  color: 'var(--color-text-display)',
                  border: 0,
                  borderRadius: 'var(--radius-button)',
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-label)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                {status.kind === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
            {status.kind === 'error' ? (
              <p
                role="alert"
                style={{
                  margin: 0,
                  padding: 'var(--space-3) var(--space-4)',
                  border: '1px solid var(--color-accent)',
                  borderRadius: 'var(--radius-compact)',
                  color: 'var(--color-accent)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-body-sm)',
                }}
              >
                {status.message}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
