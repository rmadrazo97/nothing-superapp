/**
 * Audit + idempotency helpers for copilot tools.
 *
 * `insertToolAudit` writes one row into `copilot_tool_calls` per invocation
 * (success + failure), never fatal — a DB blip mustn't fail the tool call.
 *
 * `checkIdempotency` runs BEFORE a write tool executes: it derives a 30-second
 * bucket hash from (tool_name + input + user_id) and looks up a prior row with
 * the same idempotency_key. If found (and status='ok'), the caller short-
 * circuits and returns the cached output — the second identical call inside a
 * 30s window is a no-op. See migration 025 for the DB shape.
 *
 * The 30-second bucket is a compromise between "block every duplicate ever"
 * (would defeat legit re-runs an hour later) and "no dedupe" (the observed
 * agent-loop race window is < 5s). Every observed prod duplicate has been
 * within the same second.
 */
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ToolAuditStatus = 'ok' | 'error' | 'rate_limited' | 'unauthorized' | 'payment_required';

export interface AuditInput {
  supabase: SupabaseClient;
  userId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  status: ToolAuditStatus;
  errorMessage?: string | null;
  /** Optional — only write tools compute this. See `computeIdempotencyKey`. */
  idempotencyKey?: string | null;
}

export async function insertToolAudit(args: AuditInput): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      user_id: args.userId,
      tool_name: args.toolName,
      input: safeJson(args.input),
      output: args.output !== undefined ? safeJson(args.output) : null,
      status: args.status,
      error_message: args.errorMessage ?? null,
    };
    if (args.idempotencyKey) row.idempotency_key = args.idempotencyKey;
    const { error } = await args.supabase.from('copilot_tool_calls').insert(row);
    if (error) {
      // Non-fatal — just log. Note: an idempotency collision (23505) is also
      // logged here but the caller has already returned the cached result via
      // checkIdempotency, so this only fires if two callers race the check.
      console.error('[copilot audit] insert failed', args.toolName, error.message);
    }
  } catch (err) {
    console.error('[copilot audit] threw', args.toolName, err);
  }
}

/**
 * Deterministic key for one tool invocation. Two calls with the same
 * (tool_name, input JSON, user_id) inside the same 30-second wall-clock bucket
 * produce the same key → collide on the DB's partial unique index.
 */
export function computeIdempotencyKey(
  toolName: string,
  input: unknown,
  userId: string,
  nowMs: number = Date.now(),
): string {
  const bucket = Math.floor(nowMs / 30_000);
  const material = `${toolName}|${JSON.stringify(safeJson(input))}|${userId}|${bucket}`;
  return createHash('sha256').update(material).digest('hex');
}

/**
 * Look up a prior successful invocation with the same idempotency key. If
 * found, the caller (a write tool) should return the cached `output` verbatim
 * and skip its side-effect. Miss → the tool runs as normal and inserts a
 * fresh audit row (which then blocks the next dup for 30s).
 *
 * Failure to check (DB blip, RLS oddity) returns null — we prefer letting
 * the tool run twice over blocking a legit call.
 */
export async function checkIdempotency(
  supabase: SupabaseClient,
  userId: string,
  idempotencyKey: string,
): Promise<{ hit: true; output: unknown } | { hit: false }> {
  try {
    const { data, error } = await supabase
      .from('copilot_tool_calls')
      .select('output, status')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'ok')
      .maybeSingle();
    if (error) return { hit: false };
    if (!data) return { hit: false };
    return { hit: true, output: data.output };
  } catch {
    return { hit: false };
  }
}

/**
 * Best-effort JSON coercion — the LLM occasionally emits values that don't
 * round-trip through `JSON.stringify` cleanly (bigints etc.). Fall back to a
 * string representation rather than blowing up the audit path.
 */
function safeJson(v: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return { _unserializable: String(v) };
  }
}
