/**
 * SSE parser — turns a `ReadableStream<Uint8Array>` (the body of a fetch()
 * response) into an async iterable of decoded copilot frames.
 *
 * Wire format (see apps/web/src/app/api/copilot/route.ts):
 *   data: {"delta": "..."}\n\n       — assistant content token
 *   data: {"reasoning": "..."}\n\n   — Kimi K2 reasoning/thinking token
 *   data: {"error": "..."}\n\n       — recoverable error
 *   data: [DONE]\n\n                 — stream terminator
 *
 * The parser is deliberately tolerant:
 *   - Frames may be split across chunk boundaries — we buffer until we see
 *     a full `\n\n` separator.
 *   - We ignore blank lines and anything that doesn't start with `data:`
 *     (e.g. `event:` or `id:` — not currently emitted, but SSE-legal).
 *   - Malformed JSON payloads yield an `{ error }` frame rather than
 *     throwing, so a single garbled frame won't abort the whole stream.
 *   - `[DONE]` ends the iteration cleanly (no error frame).
 */

export type CopilotFrame =
  | { delta: string }
  | { reasoning: string }
  | { error: string };

const DATA_PREFIX = 'data: ';
const DONE_PAYLOAD = '[DONE]';

export async function* parseCopilotStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<CopilotFrame, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // Flush anything the server left without a trailing separator.
        // In practice the copilot route always emits `[DONE]\n\n`, but be lenient.
        if (buffer.trim().length > 0) {
          const frame = parseEventBlock(buffer);
          if (frame === 'done') return;
          if (frame) yield frame;
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      // Split on the SSE event separator. Everything before the last `\n\n`
      // is a complete event; everything after is a partial event we hold
      // in the buffer until the next chunk arrives.
      let sepIndex = buffer.indexOf('\n\n');
      while (sepIndex !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        const frame = parseEventBlock(rawEvent);
        if (frame === 'done') return;
        if (frame) yield frame;

        sepIndex = buffer.indexOf('\n\n');
      }
    }
  } finally {
    // Ensure the underlying reader is released even if the consumer
    // abandons the iterator (e.g. component unmounts mid-stream).
    try {
      reader.releaseLock();
    } catch {
      // Reader may already be released if the stream closed cleanly.
    }
  }
}

/**
 * Parse a single SSE event block (may contain multiple `data:` lines per
 * the spec, though our server always emits exactly one). Returns:
 *   - `'done'` for the `[DONE]` terminator
 *   - a `CopilotFrame` for a well-formed data payload
 *   - `null` for blank / unknown / comment lines
 */
function parseEventBlock(block: string): CopilotFrame | 'done' | null {
  const lines = block.split('\n');
  let dataPayload = '';

  for (const line of lines) {
    if (line.length === 0 || line.startsWith(':')) continue; // blanks + comments
    if (line.startsWith(DATA_PREFIX)) {
      dataPayload += (dataPayload.length > 0 ? '\n' : '') + line.slice(DATA_PREFIX.length);
    }
    // Silently ignore `event:` / `id:` / `retry:` — the copilot route doesn't emit them.
  }

  if (dataPayload.length === 0) return null;
  if (dataPayload === DONE_PAYLOAD) return 'done';

  try {
    const parsed = JSON.parse(dataPayload) as Partial<{
      delta: string;
      reasoning: string;
      error: string;
    }>;
    if (typeof parsed.delta === 'string') return { delta: parsed.delta };
    if (typeof parsed.reasoning === 'string') return { reasoning: parsed.reasoning };
    if (typeof parsed.error === 'string') return { error: parsed.error };
    return null;
  } catch {
    return { error: 'malformed_frame' };
  }
}
