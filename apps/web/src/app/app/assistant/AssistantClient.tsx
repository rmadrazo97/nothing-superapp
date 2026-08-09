'use client';

/**
 * AssistantClient — client shell for the standalone copilot page.
 *
 * Owns:
 *   - ?t=<thread_id> URL binding via useSearchParams + router.replace.
 *   - ThreadDrawer state (open/closed) + hamburger button.
 *   - Loading the chosen thread's persisted messages so the chat rehydrates.
 *   - Passing thread_id + initialMessages into <CopilotChat/> so onFinish
 *     persists new turns to the right row.
 *
 * The chat is keyed by threadId so switching between threads remounts the
 * useChat state cleanly (no leaked in-flight streams).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UIMessage } from 'ai';
import { CopilotChat } from '@/components/copilot/CopilotChat';
import { ThreadDrawer } from '@/components/copilot/ThreadDrawer';
import type { CopilotMessage } from '@nothing/shared';

// UUID v4 sanity check — we don't trust query params blindly.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function AssistantClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawT = searchParams.get('t');
  const threadIdFromUrl = rawT && UUID_RE.test(rawT) ? rawT : null;

  const [threadId, setThreadId] = useState<string | null>(threadIdFromUrl);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [hydrating, setHydrating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Keep local threadId in sync with the URL (back/forward navigation).
  useEffect(() => {
    setThreadId(threadIdFromUrl);
  }, [threadIdFromUrl]);

  // Hydrate messages whenever the selected thread id changes. New threads
  // (no id → null) or invalid ids skip the fetch and render empty state.
  useEffect(() => {
    if (!threadId) {
      setInitialMessages([]);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    void fetch(`/api/copilot/threads/${threadId}`, { credentials: 'same-origin' })
      .then((r) => {
        if (r.status === 404) {
          // Stale URL — clear it silently so the user isn't stuck.
          throw new Error('not_found');
        }
        return r.json();
      })
      .then((data: { thread?: unknown; messages?: CopilotMessage[] }) => {
        if (cancelled) return;
        const rows = Array.isArray(data.messages) ? data.messages : [];
        const rehydrated: UIMessage[] = rows.map((row) => ({
          id: row.id,
          role: row.role,
          parts: Array.isArray(row.parts) ? (row.parts as UIMessage['parts']) : [],
        }));
        setInitialMessages(rehydrated);
      })
      .catch(() => {
        if (cancelled) return;
        // Bad id — drop the query param, start fresh.
        setInitialMessages([]);
        router.replace('/app/assistant');
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, router]);

  // Called by CopilotChat when the user sends their first message in a
  // threadless session — creates a thread server-side + writes to the URL
  // so onFinish persistence lands correctly.
  const ensureThreadForFirstMessage = useCallback(
    async (_firstUserText: string) => {
      if (threadId) return;
      try {
        const res = await fetch('/api/copilot/threads', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { thread?: { id: string } };
        if (data.thread?.id) {
          setThreadId(data.thread.id);
          const params = new URLSearchParams(searchParams.toString());
          params.set('t', data.thread.id);
          router.replace(`/app/assistant?${params.toString()}`);
        }
      } catch {
        // If thread creation fails the chat still works — just non-persistent.
      }
    },
    [threadId, router, searchParams],
  );

  const selectThread = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('t', id);
      router.replace(`/app/assistant?${params.toString()}`);
    },
    [router, searchParams],
  );

  const clearThread = useCallback(() => {
    router.replace('/app/assistant');
  }, [router]);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const hamburger = (
    <button
      type="button"
      aria-label="Open chat threads"
      onClick={openDrawer}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        height: 40,
        background: 'transparent',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-compact)',
        color: 'var(--color-text-primary)',
        fontFamily: 'var(--font-label)',
        fontSize: 18,
        lineHeight: 1,
        cursor: 'pointer',
      }}
    >
      ☰
    </button>
  );

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
        }}
      >
        {hamburger}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span
            className="label"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            ◐ COPILOT
          </span>
        </div>
        <button
          type="button"
          aria-label="Start a new chat"
          onClick={clearThread}
          style={{
            width: 40,
            height: 40,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-compact)',
            fontFamily: 'var(--font-label)',
            fontSize: 18,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          +
        </button>
      </header>

      {hydrating ? (
        <div
          style={{
            padding: 'var(--space-6)',
            color: 'var(--color-text-secondary)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Loading chat…
        </div>
      ) : (
        <CopilotChat
          // Key by threadId so useChat state resets cleanly on thread switch.
          // Falsy → single key so a "new chat" empty state doesn't remount
          // on every render.
          key={threadId ?? 'new'}
          threadId={threadId}
          initialMessages={initialMessages}
          onFirstMessage={(text) => void ensureThreadForFirstMessage(text)}
        />
      )}

      <ThreadDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        activeThreadId={threadId}
        onSelect={selectThread}
        onCreated={(id) => {
          selectThread(id);
        }}
        onDeleted={(deletedId) => {
          if (deletedId === threadId) clearThread();
        }}
      />
    </div>
  );
}
