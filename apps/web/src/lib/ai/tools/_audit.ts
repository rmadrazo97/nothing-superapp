/**
 * Audit helper — inserts one row into `copilot_tool_calls` per tool
 * invocation. Called from every tool's `execute()` fn (both success and
 * failure paths) so we have a complete accountability trail.
 *
 * Failure to write the audit row is intentionally NON-fatal — a DB blip
 * mustn't fail an otherwise-successful tool call. We log to console.error
 * so ops can spot systemic issues, but the tool result flows through.
 */
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
}

export async function insertToolAudit(args: AuditInput): Promise<void> {
  try {
    const { error } = await args.supabase.from('copilot_tool_calls').insert({
      user_id: args.userId,
      tool_name: args.toolName,
      input: safeJson(args.input),
      output: args.output !== undefined ? safeJson(args.output) : null,
      status: args.status,
      error_message: args.errorMessage ?? null,
    });
    if (error) {
      // Non-fatal — just log.
      console.error('[copilot audit] insert failed', args.toolName, error.message);
    }
  } catch (err) {
    console.error('[copilot audit] threw', args.toolName, err);
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
