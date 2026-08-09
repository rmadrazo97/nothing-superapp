/**
 * Kimi K2 client (OpenAI-compatible SDK pointed at Moonshot) — lazy singleton.
 *
 * The Moonshot API exposes an OpenAI-shaped `/v1/chat/completions` endpoint,
 * so we reuse the official `openai` package to avoid rebuilding SSE parsing.
 * The exact model slug lives in env (`KIMI_MODEL`); the current spec pins it
 * to `kimi-k2.6`. Other K2 variants (e.g. `kimi-k2-0905-preview`) do NOT
 * exist on the Moonshot production endpoint — do not substitute.
 *
 * Lazy so `next build` (which walks route handlers to collect config) doesn't
 * fail when KIMI_API_KEY is unset in the build environment. Server-only.
 */
import OpenAI from 'openai';

let cached: OpenAI | null = null;

function build(): OpenAI {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) throw new Error('KIMI_API_KEY is not set');
  return new OpenAI({
    apiKey,
    baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
  });
}

export const kimi: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    if (!cached) cached = build();
    const value = Reflect.get(cached as object, prop, receiver);
    return typeof value === 'function' ? value.bind(cached) : value;
  },
});

export const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.6';
