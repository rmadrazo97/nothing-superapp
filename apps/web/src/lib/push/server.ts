/**
 * Web Push server library.
 *
 * Thin wrapper around the `web-push` package that:
 *   1. Lazily configures VAPID from env on first use — throws loudly at
 *      request time if the private key is missing (rather than at import
 *      time, which would break unrelated route handlers).
 *   2. Sends notifications and logs the outcome into `push_deliveries`.
 *   3. Handles the "410 Gone" / "404 Not Found" cleanup path — the browser
 *      told us the subscription is dead, so we delete the row.
 *
 * IMPORTANT: this module uses the service-role Supabase client. It bypasses
 * RLS by design — broadcasts fan out across every user. It MUST NEVER be
 * imported from client code or exposed through a public route without an
 * auth/admin gate wrapping it.
 */
import 'server-only';
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { supabaseService } from '@/lib/supabase/service';
import { VAPID_PUBLIC_KEY } from './vapid';
import type { PushTopic } from '@nothing/shared';

// ─── VAPID config (lazy) ───────────────────────────────────────────────────

let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:jmadrazo7@gmail.com';
  if (!privateKey) {
    throw new Error(
      '[push] VAPID_PRIVATE_KEY is not set. Web Push cannot send notifications.',
    );
  }
  webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, privateKey);
  vapidConfigured = true;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
};

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type SendOutcome = {
  status: 'ok' | 'gone' | 'error';
  errorMessage?: string;
};

// ─── Core send ─────────────────────────────────────────────────────────────

async function sendOne(
  sub: StoredSubscription,
  payload: PushPayload,
  topic: string | null,
): Promise<SendOutcome> {
  ensureVapidConfigured();
  const webPushSub: WebPushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };
  try {
    await webpush.sendNotification(webPushSub, JSON.stringify(payload));
    await recordDelivery(sub.id, topic, payload, { status: 'ok' });
    return { status: 'ok' };
  } catch (err: unknown) {
    // web-push throws WebPushError with a `.statusCode`. 404 or 410 mean
    // the subscription is dead and MUST be pruned.
    const anyErr = err as { statusCode?: number; body?: string; message?: string };
    const code = anyErr?.statusCode;
    if (code === 404 || code === 410) {
      await deleteSubscription(sub.id);
      await recordDelivery(sub.id, topic, payload, {
        status: 'gone',
        errorMessage: `gone (${code})`,
      });
      return { status: 'gone' };
    }
    const message =
      (anyErr?.body?.toString().slice(0, 500) ?? anyErr?.message ?? 'unknown').toString();
    await recordDelivery(sub.id, topic, payload, {
      status: 'error',
      errorMessage: `${code ?? '?'} ${message}`,
    });
    // eslint-disable-next-line no-console
    console.warn('[push] send failed', { subscription_id: sub.id, code, message });
    return { status: 'error', errorMessage: message };
  }
}

async function deleteSubscription(id: string): Promise<void> {
  const svc = supabaseService();
  const { error } = await svc.from('push_subscriptions').delete().eq('id', id);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[push] failed to delete gone subscription', { id, error });
  }
}

async function recordDelivery(
  subscriptionId: string,
  topic: string | null,
  payload: PushPayload,
  outcome: SendOutcome,
): Promise<void> {
  const svc = supabaseService();
  const { error } = await svc.from('push_deliveries').insert({
    subscription_id: subscriptionId,
    topic,
    payload,
    status: outcome.status,
    error_message: outcome.errorMessage ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[push] failed to record delivery', { subscriptionId, error });
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export type SendResult = {
  sent: number;
  failed: number;
  gone: number;
};

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  topic: PushTopic | null = null,
): Promise<SendResult> {
  const svc = supabaseService();
  const { data, error } = await svc
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) {
    throw new Error(`[push] failed to load subscriptions: ${error.message}`);
  }
  const subs = (data ?? []) as StoredSubscription[];
  return fanOut(subs, payload, topic);
}

export type BroadcastOptions = {
  /** Only send to users whose `preferences.push_topics` contains this. */
  onlySubscribedTo?: PushTopic;
};

export async function broadcastPush(
  payload: PushPayload,
  opts: BroadcastOptions = {},
): Promise<SendResult> {
  const svc = supabaseService();

  // Two-step: read the user_ids that opted into the topic, then fetch their
  // subscriptions. Postgres text[] `@>` handles the array contains check.
  let userIds: string[] | null = null;
  if (opts.onlySubscribedTo) {
    const { data: prefs, error: prefsErr } = await svc
      .from('preferences')
      .select('user_id, push_enabled, push_topics')
      .eq('push_enabled', true)
      .contains('push_topics', [opts.onlySubscribedTo]);
    if (prefsErr) {
      throw new Error(`[push] failed to load prefs: ${prefsErr.message}`);
    }
    userIds = (prefs ?? []).map((p: { user_id: string }) => p.user_id);
    if (userIds.length === 0) {
      return { sent: 0, failed: 0, gone: 0 };
    }
  }

  let query = svc.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  if (userIds) query = query.in('user_id', userIds);
  const { data, error } = await query;
  if (error) {
    throw new Error(`[push] failed to load subscriptions: ${error.message}`);
  }
  const subs = (data ?? []) as StoredSubscription[];
  return fanOut(subs, payload, opts.onlySubscribedTo ?? null);
}

async function fanOut(
  subs: StoredSubscription[],
  payload: PushPayload,
  topic: string | null,
): Promise<SendResult> {
  const results = await Promise.all(subs.map((s) => sendOne(s, payload, topic)));
  const summary: SendResult = { sent: 0, failed: 0, gone: 0 };
  for (const r of results) {
    if (r.status === 'ok') summary.sent += 1;
    else if (r.status === 'gone') summary.gone += 1;
    else summary.failed += 1;
  }
  return summary;
}
