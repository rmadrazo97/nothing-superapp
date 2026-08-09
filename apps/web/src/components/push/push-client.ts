/**
 * Browser-side helpers shared between the opt-in banner and the settings
 * surface. Kept framework-agnostic so both can call `enablePush()` without
 * duplicating the SW dance.
 */
'use client';

import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from '@/lib/push/vapid';

export type EnableResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'failed'; message?: string };

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function currentPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

async function getReadyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // Prefer `ready` (waits for active SW) over `getRegistration`.
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/**
 * Full opt-in flow: request permission → subscribe → POST to server.
 * On any hop failure returns a discriminated result so the caller can
 * decide what to say to the user (denied vs unsupported vs network error).
 */
export async function enablePush(): Promise<EnableResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  // Some browsers (Safari desktop) require permission be requested via
  // Notification.requestPermission; others let subscribe() ask. Do it
  // explicitly so the outcome is predictable.
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (err) {
    return { ok: false, reason: 'failed', message: (err as Error)?.message };
  }
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' };
  }

  const reg = await getReadyRegistration();
  if (!reg) return { ok: false, reason: 'failed', message: 'no-service-worker' };

  let sub: PushSubscription;
  try {
    // If we already have a subscription (device previously opted in on
    // another account) reuse it; the server upsert will re-key it to the
    // current user.
    const existing = await reg.pushManager.getSubscription();
    sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: `urlBase64ToUint8Array` returns `Uint8Array<ArrayBufferLike>`
        // but PushManager.subscribe expects `BufferSource` (ArrayBuffer-
        // backed). Runtime shape is identical; TS is only complaining about
        // ArrayBufferLike vs ArrayBuffer variance.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }));
  } catch (err) {
    return { ok: false, reason: 'failed', message: (err as Error)?.message };
  }

  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, reason: 'failed', message: body.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, endpoint: sub.endpoint };
  } catch (err) {
    return { ok: false, reason: 'failed', message: (err as Error)?.message };
  }
}

/**
 * Undo — unsubscribe from PushManager, tell the server, then flip the
 * preferences flag off. Best-effort; even a partial failure leaves the
 * user in a "no future push" state because the local PushSubscription is
 * gone.
 */
export async function disablePush(): Promise<{ ok: boolean }> {
  if (!isPushSupported()) return { ok: false };
  const reg = await getReadyRegistration();
  if (!reg) return { ok: false };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };

  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    // Ignore — server-side delete still hides them from future broadcasts.
  }
  try {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // Same rationale — local state is already off.
  }
  try {
    await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ push_enabled: false }),
    });
  } catch {
    /* noop */
  }
  return { ok: true };
}
