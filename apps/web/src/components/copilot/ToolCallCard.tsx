'use client';

/**
 * ToolCallCard — renders a single tool invocation part inside an assistant
 * message. Layout: [status dot] tool_name · summary (or error).
 *
 * Writes get a cadmium border (var(--color-accent)) so the user can see at
 * a glance which turns modified their data; reads get a muted border. A
 * successful `start_pomodoro` renders its `deep_link` as a real anchor so
 * the user can tap through to /app/pomodoro.
 */

const WRITE_TOOLS = new Set([
  'log_calorie_entry',
  'log_water',
  'log_weight',
  'start_pomodoro',
]);

interface ToolCallCardProps {
  toolName: string;
  state:
    | 'input-streaming'
    | 'input-available'
    | 'output-available'
    | 'output-error'
    | 'output-denied'
    | 'approval-requested'
    | 'approval-responded'
    | string;
  input: unknown;
  output: unknown;
  errorText?: string | null;
}

function readSummary(output: unknown): string | null {
  if (output && typeof output === 'object' && 'summary' in output) {
    const s = (output as { summary?: unknown }).summary;
    return typeof s === 'string' ? s : null;
  }
  return null;
}

function readOk(output: unknown): boolean | null {
  if (output && typeof output === 'object' && 'ok' in output) {
    return Boolean((output as { ok?: unknown }).ok);
  }
  return null;
}

function readError(output: unknown): string | null {
  if (output && typeof output === 'object' && 'error' in output) {
    const e = (output as { error?: unknown }).error;
    return typeof e === 'string' ? e : null;
  }
  return null;
}

function readDeepLink(output: unknown): string | null {
  if (
    output &&
    typeof output === 'object' &&
    'data' in output &&
    output.data &&
    typeof output.data === 'object' &&
    'deep_link' in output.data
  ) {
    const l = (output.data as { deep_link?: unknown }).deep_link;
    return typeof l === 'string' ? l : null;
  }
  return null;
}

export function ToolCallCard({
  toolName,
  state,
  input,
  output,
  errorText,
}: ToolCallCardProps) {
  const isWrite = WRITE_TOOLS.has(toolName);
  const isError = state === 'output-error' || readOk(output) === false;
  const isRunning = state === 'input-streaming' || state === 'input-available';

  const summary = readSummary(output);
  const error = errorText ?? readError(output);
  const deepLink = readDeepLink(output);

  // Border: cadmium for writes; error red if failed; muted otherwise.
  const borderColor = isError
    ? 'var(--color-status-error, var(--color-accent))'
    : isWrite
      ? 'var(--color-accent)'
      : 'var(--color-border-visible)';

  // Status glyph — Nothing OS shorthand.
  const glyph = isRunning ? '◐' : isError ? '✕' : isWrite ? '●' : '○';
  const statusLabel = isRunning
    ? 'RUNNING'
    : isError
      ? 'FAILED'
      : isWrite
        ? 'LOGGED'
        : 'READ';

  return (
    <div
      style={{
        marginTop: 'var(--space-2)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-compact)',
        border: `1px solid ${borderColor}`,
        background: 'var(--color-surface)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-caption)',
        color: 'var(--color-text-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}
      >
        <span aria-hidden style={{ fontSize: 'var(--text-body-sm)' }}>{glyph}</span>
        <span
          style={{
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          {statusLabel}
        </span>
        <span style={{ color: 'var(--color-text-secondary)' }}>·</span>
        <code
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--color-text-primary)',
          }}
        >
          {toolName}
        </code>
      </div>
      {summary && !isError && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-text-primary)',
          }}
        >
          {summary}
        </div>
      )}
      {isError && error && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-text-primary)',
          }}
        >
          {error}
        </div>
      )}
      {isRunning && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-text-secondary)',
          }}
        >
          working…
        </div>
      )}
      {deepLink && !isError && (
        <a
          href={deepLink}
          style={{
            marginTop: 'var(--space-1)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-compact)',
            border: '1px solid var(--color-accent)',
            color: 'var(--color-accent)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-caption)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            width: 'fit-content',
          }}
        >
          Open →
        </a>
      )}
      {/* Debug details available via <details> for support triage. */}
      <details style={{ marginTop: 'var(--space-1)' }}>
        <summary
          style={{
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
          }}
        >
          details
        </summary>
        <pre
          style={{
            marginTop: 'var(--space-2)',
            padding: 'var(--space-2)',
            fontSize: 11,
            lineHeight: 1.4,
            overflow: 'auto',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border-subtle, var(--color-border-visible))',
            borderRadius: 'var(--radius-compact)',
            color: 'var(--color-text-secondary)',
          }}
        >
          input: {JSON.stringify(input, null, 2)}
          {output ? `\n\noutput: ${JSON.stringify(output, null, 2)}` : ''}
        </pre>
      </details>
    </div>
  );
}
