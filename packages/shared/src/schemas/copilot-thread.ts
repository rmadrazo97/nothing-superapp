/**
 * copilot-thread.ts — persistent copilot chat thread + message schemas.
 *
 * Backs migration 015_copilot_threads.sql. The `parts` column is the raw
 * Vercel AI SDK UIMessage.parts array — text + tool-invocation + reasoning
 * + file parts. We store it as opaque jsonb because the AI SDK owns the
 * shape and evolves it independently; validating it in Zod would either
 * lag behind or reject legitimate future parts.
 */
import { z } from 'zod';

// ─── copilot_threads ──────────────────────────────────────────────────────

export const copilotThreadRoleEnum = z.enum(['user', 'assistant', 'system']);

export const copilotThreadSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  // Free-form scope hint — matches whatever the client sends as
  // `body.context` on /api/copilot. Kept text (not enum) so a new mini-app
  // scope doesn't need a migration.
  context: z.string().max(60).nullable().optional(),
  last_message_at: z.string().datetime({ offset: true }),
  archived_at: z.string().datetime({ offset: true }).nullable().optional(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const copilotThreadInsertSchema = z
  .object({
    // Server auto-titles from the first user message; caller may override
    // (e.g. "Renaming an existing thread via the drawer").
    title: z.string().min(1).max(200).optional(),
    context: z.string().max(60).nullable().optional(),
  })
  .strict();

export const copilotThreadUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    // Set archived_at to now() via API to soft-delete; omit or null to
    // un-archive. Client sends `archived: true|false` for ergonomics —
    // the server maps it.
    archived: z.boolean().optional(),
  })
  .strict();

// ─── copilot_messages ─────────────────────────────────────────────────────

/**
 * We deliberately keep the UIMessage.parts array as `z.unknown()` — the AI
 * SDK owns that shape and adds/renames variants each minor release. The
 * server-side persist path only touches `text`, `tool-*`, `reasoning`, and
 * `file` variants; anything else round-trips as opaque jsonb.
 */
export const copilotMessagePartSchema = z.unknown();

export const copilotMessageSchema = z.object({
  id: z.string().uuid(),
  thread_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: copilotThreadRoleEnum,
  parts: z.array(copilotMessagePartSchema),
  created_at: z.string().datetime({ offset: true }),
});

export const copilotMessageInsertSchema = z
  .object({
    thread_id: z.string().uuid(),
    role: copilotThreadRoleEnum,
    parts: z.array(copilotMessagePartSchema).min(1),
  })
  .strict();

// ─── Inferred TS types ────────────────────────────────────────────────────

export type CopilotThreadRole = z.infer<typeof copilotThreadRoleEnum>;
export type CopilotThread = z.infer<typeof copilotThreadSchema>;
export type CopilotThreadInsert = z.infer<typeof copilotThreadInsertSchema>;
export type CopilotThreadUpdate = z.infer<typeof copilotThreadUpdateSchema>;
export type CopilotMessage = z.infer<typeof copilotMessageSchema>;
export type CopilotMessageInsert = z.infer<typeof copilotMessageInsertSchema>;

/**
 * Derive a default thread title from the first user message. Trims,
 * truncates to 60 chars, appends "…" if truncated. Fallback covers the
 * attachments-only "here's my plate" edge case.
 */
export function deriveThreadTitle(firstUserText: string | null | undefined): string {
  const raw = (firstUserText ?? '').replace(/\s+/g, ' ').trim();
  if (raw.length === 0) return 'New chat';
  if (raw.length <= 60) return raw;
  return `${raw.slice(0, 59)}…`;
}
