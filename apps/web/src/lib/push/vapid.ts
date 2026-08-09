/**
 * VAPID public key — safe to ship to the browser.
 *
 * Web Push requires the client-side `pushManager.subscribe()` call to pass
 * `applicationServerKey`, which is the public half of the VAPID keypair.
 * This is public by design; the private key stays server-side in
 * `VAPID_PRIVATE_KEY` (env) and is used only when signing outgoing pushes.
 *
 * If you ever rotate the keypair:
 *   1. Generate a new pair: `npx web-push generate-vapid-keys`
 *   2. Update this constant + push the new private key to env (local +
 *      GitHub secret + Vercel env for all three environments).
 *   3. Existing subscriptions become undeliverable — the server-side
 *      cleanup path (410 Gone) will prune them lazily on the next
 *      broadcast attempt.
 */
export const VAPID_PUBLIC_KEY =
  'BNCCLxpTRNkOD59oqFsGneJQKtm_rFrwUTcm1z-21Pfw5mnq02chCRCctRvDghxrv5YMDjaMVhGLYkGE_e00IY8';

/**
 * Browser helper — the `applicationServerKey` field expects a Uint8Array,
 * not a base64url string. Lives here so the opt-in banner + settings surface
 * can share the identical parse without pulling `web-push` into the bundle.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof atob !== 'undefined'
    ? atob(base64)
    : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
