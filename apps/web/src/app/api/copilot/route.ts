/**
 * POST /api/copilot — Kimi K2 streaming chat endpoint.
 *
 * Read-only across the user's mini-app data. This endpoint MUST NOT write
 * anything to the database (spec §3). It:
 *   1. resolves the session via `@supabase/ssr` server client,
 *   2. assembles a compact JSON context from profiles + preferences + last-20
 *      calorie entries + last-20 events (all scoped to the user),
 *   3. prepends a system prompt that pins read-only + no-fabrication rules,
 *   4. streams the Kimi response as Server-Sent Events.
 *
 * SSE frame formats emitted:
 *   data: {"delta": "..."}\n\n       — visible assistant token
 *   data: {"reasoning": "..."}\n\n   — Kimi K2 thinking token (UI may hide)
 *   data: {"error": "..."}\n\n       — recoverable error, stream still closes
 *   data: [DONE]\n\n                 — terminator (mirrors OpenAI's convention)
 *
 * Next.js 16 route handler: we return a `Response` wrapping a `ReadableStream`
 * (see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md#streaming).
 * We do NOT use the Vercel AI SDK here — we're one hop from raw Moonshot SSE
 * and rolling our own keeps the wire format transparent for task 13's UI.
 */
import { createClient } from '@/lib/supabase/server';
import { kimi, KIMI_MODEL } from '@/lib/kimi/client';
import { assembleUserContext } from '@/lib/kimi/context';

// Force dynamic — this handler is always request-scoped (auth + streaming).
export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 20;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function sseDone(): string {
  return 'data: [DONE]\n\n';
}

export async function POST(request: Request) {
  // 1. Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Parse + validate body.
  let body: { messages?: ChatMessage[] };
  try {
    body = (await request.json()) as { messages?: ChatMessage[] };
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages_required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (messages.length > MAX_MESSAGES) {
    return new Response(
      JSON.stringify({ error: 'too_many_messages', max: MAX_MESSAGES }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  // Shape check on each item.
  for (const m of messages) {
    if (
      !m ||
      (m.role !== 'user' && m.role !== 'assistant') ||
      typeof m.content !== 'string'
    ) {
      return new Response(
        JSON.stringify({ error: 'invalid_message_shape' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  // 3. Assemble cross-mini-app context (read-only).
  const { context } = await assembleUserContext(user.id, supabase);

  const systemPrompt = [
    "You are Nothing Superapp's copilot. You have read-only access to the",
    'user\'s data across every mini-app they use. Answer their questions',
    'using the context below. If the context doesn\'t contain relevant',
    'data, say so honestly — do not fabricate facts.',
    '',
    'Never claim to have taken any action on the user\'s behalf.',
    'Never suggest external URLs or file paths.',
    '',
    '--- USER CONTEXT ---',
    context,
    '--- END CONTEXT ---',
  ].join('\n');

  // 4. Kick off the upstream stream.
  //    We intentionally construct the ReadableStream ourselves so we can
  //    normalize Moonshot's `reasoning_content` deltas alongside `content`.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const upstream = await kimi.chat.completions.create({
          model: KIMI_MODEL,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        });

        for await (const chunk of upstream) {
          const delta = chunk.choices?.[0]?.delta as
            | { content?: string | null; reasoning_content?: string | null }
            | undefined;
          if (!delta) continue;
          if (delta.content) {
            controller.enqueue(encoder.encode(sseFrame({ delta: delta.content })));
          }
          if (delta.reasoning_content) {
            controller.enqueue(
              encoder.encode(sseFrame({ reasoning: delta.reasoning_content })),
            );
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'copilot_upstream_error';
        controller.enqueue(encoder.encode(sseFrame({ error: message })));
      } finally {
        controller.enqueue(encoder.encode(sseDone()));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
