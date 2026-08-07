import type { EventKind } from '@nothing/shared';

type Handler = (payload: unknown) => void;

/**
 * Tiny typed event emitter used by the shell to back
 * SharedContextValue.events. Mini-apps use it transitively via useEvents().
 *
 * No external deps — just a Map<EventKind, Set<Handler>>. Handler exceptions
 * are caught + logged so one bad subscriber never breaks the emit loop.
 */
export function createEventBus() {
  const handlers = new Map<EventKind, Set<Handler>>();

  return {
    emit(kind: EventKind, payload: unknown): void {
      const set = handlers.get(kind);
      if (!set) return;
      set.forEach((h) => {
        try {
          h(payload);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[event-bus] handler for ${kind} threw:`, err);
        }
      });
    },

    subscribe(kind: EventKind, handler: Handler): () => void {
      let set = handlers.get(kind);
      if (!set) {
        set = new Set();
        handlers.set(kind, set);
      }
      set.add(handler);
      return () => {
        set!.delete(handler);
      };
    },

    _handlerCount(kind: EventKind): number {
      return handlers.get(kind)?.size ?? 0;
    },
  };
}

export type EventBus = ReturnType<typeof createEventBus>;
