/**
 * AI provider — the ONE place we configure the chat model.
 *
 * Right now this is Kimi K2 via Moonshot's OpenAI-compatible endpoint. When
 * we swap to OpenRouter (or add fallback providers), it's a single case in
 * the switch below plus new env vars — nothing else in the app touches this.
 *
 * Design:
 *   - Lazy singleton — env is read at first use, not module load. `next build`
 *     collects route metadata without KIMI_API_KEY being present in CI.
 *   - `chatModel()` returns a v5 LanguageModel. The route handler calls it
 *     per-request so tests can stub the env.
 *   - Env keys are provider-scoped: `KIMI_*` today, `OPENROUTER_*` future.
 *     `AI_PROVIDER` (default 'kimi') switches which set is read.
 */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export type AIProviderName = 'kimi';

function readProviderName(): AIProviderName {
  const raw = (process.env.AI_PROVIDER ?? 'kimi').toLowerCase();
  if (raw === 'kimi') return 'kimi';
  // Unknown provider — fail loudly rather than silently defaulting so a
  // misconfigured env doesn't quietly route to the wrong model.
  throw new Error(`Unsupported AI_PROVIDER: ${raw}`);
}

/**
 * Build the LanguageModel for the currently-configured provider.
 *
 * `variant`:
 *   - 'text'   — default, uses KIMI_MODEL (kimi-k2.6 by default; text + tools)
 *   - 'vision' — uses KIMI_VISION_MODEL when set, otherwise falls through to
 *                KIMI_MODEL. Kimi K2.6 already advertises `supports_image_in`
 *                (verified against /v1/models), so a distinct vision model is
 *                optional — the env exists so we can force e.g.
 *                `moonshot-v1-32k-vision-preview` if the primary changes.
 */
export function chatModel(variant: 'text' | 'vision' = 'text'): LanguageModel {
  const name = readProviderName();
  switch (name) {
    case 'kimi': {
      const apiKey = process.env.KIMI_API_KEY;
      if (!apiKey) throw new Error('KIMI_API_KEY is not set');
      const baseURL = process.env.KIMI_BASE_URL ?? 'https://api.moonshot.ai/v1';
      const modelId =
        variant === 'vision'
          ? (process.env.KIMI_VISION_MODEL ?? process.env.KIMI_MODEL ?? 'kimi-k2.6')
          : (process.env.KIMI_MODEL ?? 'kimi-k2.6');
      const provider = createOpenAICompatible({
        name: 'kimi',
        baseURL,
        apiKey,
      });
      return provider.chatModel(modelId);
    }
  }
}

/** Symbolic model id — exposed for logging + audit rows. */
export function chatModelId(variant: 'text' | 'vision' = 'text'): string {
  if (variant === 'vision') {
    return process.env.KIMI_VISION_MODEL ?? process.env.KIMI_MODEL ?? 'kimi-k2.6';
  }
  return process.env.KIMI_MODEL ?? 'kimi-k2.6';
}
