'use client';
/**
 * useResource — client hook backed by the Mini-App Resource Framework REST.
 *
 * A mini-app declares its resources in `resources.ts`; this hook talks to the
 * generic routes at `/api/mini-apps/<slug>/resources/<resource>` without any
 * mini-app-specific client code. Zero new dependencies — plain fetch + React.
 *
 * Usage:
 *   const { data, isLoading, error, create, update, remove, refetch } =
 *     useResource<CalorieEntry>('calorie-lite', 'entries');
 *
 * Deliberately unopinionated on cache invalidation — call `refetch()` after a
 * mutation if you want the list to update. A follow-up wave can add
 * optimistic updates + suspense once we see real usage patterns.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseResourceOptions {
  /** Extra query params (e.g. { 'filter[meal]': 'breakfast', limit: '20' }). */
  params?: Record<string, string | number | boolean>;
  /** Skip the initial fetch if false. Default true. */
  enabled?: boolean;
}

export interface UseResourceResult<T> {
  data: T[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (body: Record<string, unknown>) => Promise<T>;
  update: (id: string, patch: Record<string, unknown>) => Promise<T>;
  remove: (id: string) => Promise<void>;
}

function buildUrl(
  slug: string,
  resource: string,
  params?: Record<string, string | number | boolean>,
  id?: string,
): string {
  const base = `/api/mini-apps/${encodeURIComponent(slug)}/resources/${encodeURIComponent(resource)}${id ? `/${encodeURIComponent(id)}` : ''}`;
  if (!params || Object.keys(params).length === 0) return base;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) usp.append(k, String(v));
  return `${base}?${usp.toString()}`;
}

async function throwOnError(res: Response): Promise<unknown> {
  if (res.ok) return res.json();
  let details: string | undefined;
  try {
    const body = (await res.json()) as { error?: string };
    details = body.error;
  } catch {
    // ignore
  }
  throw new Error(`resource_${res.status}${details ? `:${details}` : ''}`);
}

export function useResource<T = unknown>(
  slug: string,
  resource: string,
  options: UseResourceOptions = {},
): UseResourceResult<T> {
  const { params, enabled = true } = options;
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl(slug, resource, params), {
        method: 'GET',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      const body = (await throwOnError(res)) as { rows: T[] };
      setData(body.rows ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'unknown_error');
    } finally {
      setIsLoading(false);
    }
  }, [slug, resource, JSON.stringify(params ?? {})]);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
    return () => abortRef.current?.abort();
  }, [enabled, refetch]);

  const create = useCallback(
    async (body: Record<string, unknown>): Promise<T> => {
      const res = await fetch(buildUrl(slug, resource), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const parsed = (await throwOnError(res)) as { row: T };
      return parsed.row;
    },
    [slug, resource],
  );

  const update = useCallback(
    async (id: string, patch: Record<string, unknown>): Promise<T> => {
      const res = await fetch(buildUrl(slug, resource, undefined, id), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const parsed = (await throwOnError(res)) as { row: T };
      return parsed.row;
    },
    [slug, resource],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(buildUrl(slug, resource, undefined, id), {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      await throwOnError(res);
    },
    [slug, resource],
  );

  return { data, isLoading, error, refetch, create, update, remove };
}
