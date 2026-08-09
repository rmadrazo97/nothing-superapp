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

/** Build the LanguageModel for the currently-configured provider. */
export function chatModel(): LanguageModel {
  const name = readProviderName();
  switch (name) {
    case 'kimi': {
      const apiKey = process.env.KIMI_API_KEY;
      if (!apiKey) throw new Error('KIMI_API_KEY is not set');
      const baseURL = process.env.KIMI_BASE_URL ?? 'https://api.moonshot.ai/v1';
      const modelId = process.env.KIMI_MODEL ?? 'kimi-k2.6';
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
export function chatModelId(): string {
  return process.env.KIMI_MODEL ?? 'kimi-k2.6';
}
