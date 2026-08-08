'use client';

/**
 * One toast row.
 *
 * Owns its own auto-dismiss timer + hover-pause. The timer runs from
 * mount; on pointer-enter we clear it and on pointer-leave we restart
 * with the full remaining duration (simple + honest — we don't try to
 * subtract elapsed time). `duration === 0` disables auto-dismiss.
 *
 * Enter animation is driven by a `mounted` flag flipped on the first
 * effect tick so the browser sees the initial (offset, invisible) state
 * before transitioning to the resting state. No layout thrash — pure
 * transform + opacity.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ToastItem } from '@/lib/toast/toast-store';

const VARIANT_BORDER: Record<ToastItem['variant'], string> = {
  info: 'var(--color-text-secondary)',
  success: 'var(--color-success)',
  error: 'var(--color-accent)',
};

const VARIANT_LABEL: Record<ToastItem['variant'], string> = {
  info: 'Notice',
  success: 'Success',
  error: 'Error',
};

export function Toast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger enter transition on next tick.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Auto-dismiss timer.
  useEffect(() => {
    if (item.duration <= 0) return;
    timerRef.current = setTimeout(() => onDismiss(item.id), item.duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [item.id, item.duration, onDismiss]);

  function pause() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function resume() {
    if (item.duration <= 0 || timerRef.current) return;
    timerRef.current = setTimeout(() => onDismiss(item.id), item.duration);
  }

  const style: CSSProperties = {
    pointerEvents: 'auto',
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border-visible)',
    borderLeft: `3px solid ${VARIANT_BORDER[item.variant]}`,
    borderRadius: 'var(--radius-card)',
    padding: 'var(--space-3) var(--space-4)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-body-sm)',
    color: 'var(--color-text-primary)',
    minWidth: 240,
    maxWidth: 360,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(-8px)',
    transition:
      'opacity 180ms var(--ease-out), transform 180ms var(--ease-out)',
  };

  return (
    <div
      role={item.variant === 'error' ? 'alert' : 'status'}
      aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
      style={style}
      onPointerEnter={pause}
      onPointerLeave={resume}
      onClick={() => onDismiss(item.id)}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          marginTop: 6,
          borderRadius: '50%',
          background: VARIANT_BORDER[item.variant],
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="label"
          style={{
            color: VARIANT_BORDER[item.variant],
            marginBottom: 'var(--space-1)',
          }}
        >
          {VARIANT_LABEL[item.variant]}
        </div>
        <div style={{ wordBreak: 'break-word' }}>{item.message}</div>
      </div>
    </div>
  );
}
