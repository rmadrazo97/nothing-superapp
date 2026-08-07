/**
 * useEntitlement — client hook for subscription-aware UI.
 *
 * Reads from the auth-gated `GET /api/entitlement` Route Handler rather than
 * hitting Supabase directly from the browser. This keeps the entitlement
 * derivation (status window + current_period_end grace) centralized in
 * `lib/entitlement.ts` — every consumer sees the same verdict the Proxy uses
 * to gate `/app/*` routes, so there's no client-vs-server drift where the
 * home grid thinks you're free but the Proxy redirects you to /paywall.
 *
 * Consumers:
 *   - Task 10 home grid — dims tiles + shows "Subscribe" upsell when
 *     entitlement === 'inactive'.
 *   - Task 11 settings — renders billing card ("You're subscribed…" vs
 *     "Not subscribed — subscribe").
 *   - Task 13 copilot UI — can nudge unsubscribed users toward upgrade.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

export type Entitlement = 'active' | 'trialing' | 'inactive';

export interface EntitlementSubscription {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface UseEntitlementResult {
  entitlement: Entitlement;
  subscription: EntitlementSubscription | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const INITIAL: Omit<UseEntitlementResult, 'refresh'> = {
  entitlement: 'inactive',
  subscription: null,
  isLoading: true,
};

export function useEntitlement(): UseEntitlementResult {
  const [state, setState] = useState<Omit<UseEntitlementResult, 'refresh'>>(INITIAL);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/entitlement', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      if (!res.ok) {
        // 401 (unauthed) and 5xx both fall back to a safe 'inactive' state —
        // the Proxy is the real gate; this is just for UI presentation.
        setState({ entitlement: 'inactive', subscription: null, isLoading: false });
        return;
      }
      const body = (await res.json()) as {
        entitlement: Entitlement;
        subscription: EntitlementSubscription | null;
      };
      setState({
        entitlement: body.entitlement,
        subscription: body.subscription,
        isLoading: false,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setState({ entitlement: 'inactive', subscription: null, isLoading: false });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true }));
    await load();
  }, [load]);

  return { ...state, refresh };
}
