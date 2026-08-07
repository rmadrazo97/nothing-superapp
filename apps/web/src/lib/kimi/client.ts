/**
 * Kimi K2 client (OpenAI-compatible SDK pointed at Moonshot).
 *
 * The Moonshot API exposes an OpenAI-shaped `/v1/chat/completions` endpoint,
 * so we reuse the official `openai` package to avoid rebuilding SSE parsing.
 * The exact model slug lives in env (`KIMI_MODEL`); the current spec pins it
 * to `kimi-k2.6`. Other K2 variants (e.g. `kimi-k2-0905-preview`) do NOT
 * exist on the Moonshot production endpoint — do not substitute.
 */
import OpenAI from 'openai';

export const kimi = new OpenAI({
  apiKey: process.env.KIMI_API_KEY!,
  baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
});

export const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.6';
