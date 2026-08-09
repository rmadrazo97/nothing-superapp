'use client';

/**
 * ThreadDrawer — left-side slide-in drawer that lists the user's chat
 * threads. Opens over the assistant page but doesn't eclipse it (so the
 * current chat stays visible in the right ~15%), matching the redesign
 * spec's "not a modal takeover" rule.
 *
 * Behaviours:
 *   - `+ NEW CHAT` cadmium chip at top → creates a new thread via POST
 *     /api/copilot/threads, then selects it.
 *   - Tapping a row → onSelect(thread.id) so the parent can update its
 *     URL + swap the message list.
 *   - `⋯` per-row → Rename + × Delete (two-tap confirm inline).
 *   - Active thread has a cadmium left border.
 *   - Backdrop tap + Escape close the drawer.
 *   - safe-area-left padding so it plays nice with iOS notches.
 */
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/lib/toast/context';
import type { CopilotThread } from '@nothing/shared';

export interface ThreadDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Currently-selected thread id, if any. */
  activeThreadId: string | null;
  /** Fired when the user picks a thread from the list. */
  onSelect: (threadId: string) => void;
  /** Fired after a fresh thread is created. Parent should navigate to it. */
  onCreated: (threadId: string) => void;
  /** Fired after the active thread is deleted so the parent can clear its URL. */
  onDeleted: (deletedId: string) => void;
}

export function ThreadDrawer({
  open,
  onClose,
  activeThreadId,
  onSelect,
  onCreated,
  onDeleted,
}: ThreadDrawerProps) {
  const [threads, setThreads] = useState<CopilotThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Row id awaiting a second confirm-tap to delete. Auto-clears after 3s.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch the list every time the drawer opens (cheap + always fresh).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void fetch('/api/copilot/threads', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data: { threads?: CopilotThread[] }) => {
        if (cancelled) return;
        setThreads(Array.isArray(data.threads) ? data.threads : []);
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load chats.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  // Escape closes; body-scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Auto-clear the pending confirm-delete after 3 seconds.
  useEffect(() => {
    if (!confirmDeleteId) return;
    const t = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteId]);

  const createThread = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/copilot/threads', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`create failed: ${res.status}`);
      const data = (await res.json()) as { thread?: CopilotThread };
      if (!data.thread) throw new Error('malformed response');
      setThreads((prev) => [data.thread!, ...prev]);
      onCreated(data.thread.id);
    } catch {
      toast.error("Couldn't start a new chat.");
    } finally {
      setCreating(false);
    }
  }, [creating, onCreated, toast]);

  const beginRename = useCallback((thread: CopilotThread) => {
    setRenameId(thread.id);
    setRenameValue(thread.title);
    setConfirmDeleteId(null);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renameId) return;
    const title = renameValue.trim();
    if (title.length === 0) {
      setRenameId(null);
      return;
    }
    try {
      const res = await fetch(`/api/copilot/threads/${renameId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`rename failed: ${res.status}`);
      const data = (await res.json()) as { thread?: CopilotThread };
      setThreads((prev) =>
        prev.map((t) => (t.id === renameId ? (data.thread ?? { ...t, title }) : t)),
      );
    } catch {
      toast.error("Couldn't rename chat.");
    } finally {
      setRenameId(null);
      setRenameValue('');
    }
  }, [renameId, renameValue, toast]);

  const deleteThread = useCallback(
    async (id: string) => {
      if (confirmDeleteId !== id) {
        // First tap arms the confirm; second tap fires the delete.
        setConfirmDeleteId(id);
        return;
      }
      setConfirmDeleteId(null);
      try {
        const res = await fetch(`/api/copilot/threads/${id}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`delete failed: ${res.status}`);
        setThreads((prev) => prev.filter((t) => t.id !== id));
        if (id === activeThreadId) onDeleted(id);
      } catch {
        toast.error("Couldn't delete chat.");
      }
    },
    [confirmDeleteId, activeThreadId, onDeleted, toast],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat threads"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 55,
        display: 'flex',
        pointerEvents: 'auto',
      }}
    >
      {/* Backdrop — tap to close. Semi-transparent so the chat stays visible. */}
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          animation: 'nsa-copilot-fade-in var(--dur-fast, 180ms) var(--ease-out) both',
        }}
      />

      {/* Sheet — slides in from the left. */}
      <aside
        style={{
          position: 'relative',
          width: 'min(320px, 85vw)',
          height: '100%',
          background: 'var(--color-bg)',
          borderRight: '1px solid var(--color-border-visible)',
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          animation: 'nsa-thread-slide-in var(--dur-medium, 220ms) var(--ease-out) both',
          boxShadow: '12px 0 32px rgba(0, 0, 0, 0.6)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span
            className="label"
            style={{
              fontFamily: 'var(--font-label)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--color-text-primary)',
            }}
          >
            ⚙ THREADS
          </span>
          <button
            type="button"
            aria-label="Close threads"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-body)',
              padding: 'var(--space-1) var(--space-2)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <button
            type="button"
            onClick={() => void createThread()}
            disabled={creating}
            style={{
              width: '100%',
              padding: 'var(--space-3)',
              background: 'transparent',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-compact)',
              fontFamily: 'var(--font-label)',
              fontSize: 'var(--text-caption)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: creating ? 'wait' : 'pointer',
            }}
          >
            {creating ? '…' : '+ New chat'}
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            paddingBottom: 'var(--space-4)',
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 'var(--space-4)',
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-caption)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Loading…
            </div>
          ) : threads.length === 0 ? (
            <div
              style={{
                padding: 'var(--space-4)',
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body-sm)',
              }}
            >
              No chats yet. Start one with{' '}
              <span style={{ color: 'var(--color-accent)' }}>+ NEW CHAT</span>.
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {threads.map((t) => (
                <li key={t.id}>
                  <ThreadRow
                    thread={t}
                    active={t.id === activeThreadId}
                    renaming={renameId === t.id}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onRenameCommit={() => void commitRename()}
                    onRenameCancel={() => setRenameId(null)}
                    onRenameStart={() => beginRename(t)}
                    confirmingDelete={confirmDeleteId === t.id}
                    onDelete={() => void deleteThread(t.id)}
                    onSelect={() => {
                      onSelect(t.id);
                      onClose();
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <style>{`
        @keyframes nsa-thread-slide-in {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onRenameStart,
  confirmingDelete,
  onDelete,
  onSelect,
}: {
  thread: CopilotThread;
  active: boolean;
  renaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onRenameStart: () => void;
  confirmingDelete: boolean;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const timestamp = formatRelative(thread.last_message_at);

  if (renaming) {
    return (
      <div
        style={{
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-surface)',
          borderLeft: '2px solid var(--color-accent)',
          display: 'flex',
          gap: 'var(--space-2)',
        }}
      >
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameCommit();
            if (e.key === 'Escape') onRenameCancel();
          }}
          style={{
            flex: 1,
            padding: '4px 6px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-compact)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body-sm)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={onRenameCommit}
          style={{
            padding: '2px 8px',
            background: 'var(--color-accent)',
            color: 'var(--color-text-display)',
            border: 0,
            borderRadius: 'var(--radius-compact)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            cursor: 'pointer',
          }}
        >
          OK
        </button>
      </div>
    );
  }

  return (
    <div
      className="nsa-thread-row"
      data-active={active ? 'true' : 'false'}
      style={{ position: 'relative' }}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          background: 'transparent',
          border: 0,
          padding: 0,
          textAlign: 'left',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body-sm)',
          fontWeight: active ? 500 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          paddingRight: 32,
        }}
      >
        {thread.title || 'Untitled'}
      </button>
      <span
        style={{
          fontFamily: 'var(--font-label)',
          fontSize: 10,
          letterSpacing: '0.04em',
          color: 'var(--color-text-secondary)',
        }}
      >
        {timestamp}
      </span>
      <button
        type="button"
        aria-label="Thread actions"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        style={{
          position: 'absolute',
          top: 'var(--space-2)',
          right: 'var(--space-2)',
          width: 24,
          height: 24,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 0,
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ⋯
      </button>
      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 32,
            right: 'var(--space-2)',
            zIndex: 5,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-compact)',
            overflow: 'hidden',
            minWidth: 140,
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onRenameStart();
            }}
            style={menuBtnStyle}
          >
            Rename
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              if (confirmingDelete) setMenuOpen(false);
            }}
            style={{
              ...menuBtnStyle,
              color: 'var(--color-accent)',
            }}
          >
            {confirmingDelete ? '× Confirm?' : '× Delete'}
          </button>
        </div>
      )}
    </div>
  );
}

const menuBtnStyle = {
  padding: 'var(--space-2) var(--space-3)',
  background: 'transparent',
  border: 0,
  textAlign: 'left' as const,
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-caption)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
};

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${hh}:${mm}`;
  } catch {
    return '';
  }
}
