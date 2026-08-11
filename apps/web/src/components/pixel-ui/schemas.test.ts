/**
 * Unit coverage for `coerceRenderPayload` — the defensive parser that sits
 * between the AI SDK's tool output and the pixel-ui render switch in
 * `CopilotChat.tsx`.
 *
 * v0.5.7 verified by hand that this coercer handles BOTH shapes:
 *   1. Live-stream: `{ version: 1, kind, data: { kind, ...payload } }` —
 *      the wrapped envelope every render_* tool's `execute()` returns.
 *   2. Rehydrated history: same shape (server-side normalization stores
 *      `output` verbatim on the matching `tool-<name>` part), but also a
 *      bare `RenderPayload` (`{ kind, ...payload }`) is accepted as a
 *      fallback so older messages don't break.
 *
 * These tests pin that contract down so a refactor of the schema module
 * can't silently break either path.
 */
import { describe, expect, it } from 'vitest';
import { coerceRenderPayload } from './schemas';

/* ── envelope (live-stream) shape ─────────────────────────────────────── */

describe('coerceRenderPayload — live-stream envelope', () => {
  it('parses a stat_ticker envelope', () => {
    const payload = coerceRenderPayload({
      version: 1,
      kind: 'stat_ticker',
      data: {
        kind: 'stat_ticker',
        label: 'W',
        value: '78.4',
        delta: -0.3,
      },
    });
    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe('stat_ticker');
    if (payload?.kind === 'stat_ticker') {
      expect(payload.label).toBe('W');
      expect(payload.value).toBe('78.4');
      expect(payload.delta).toBe(-0.3);
    }
  });

  it('parses a bar_chart envelope', () => {
    const payload = coerceRenderPayload({
      version: 1,
      kind: 'bar_chart',
      data: {
        kind: 'bar_chart',
        title: 'This week',
        xLabels: ['M', 'T', 'W'],
        series: [{ label: 'kcal', values: [2000, 2100, 1950] }],
      },
    });
    expect(payload?.kind).toBe('bar_chart');
  });

  it('parses a line_chart envelope', () => {
    const payload = coerceRenderPayload({
      version: 1,
      kind: 'line_chart',
      data: {
        kind: 'line_chart',
        xLabels: ['M', 'T', 'W', 'T', 'F'],
        values: [78.4, 78.1, 78.3, 78.0, 77.9],
        showArea: true,
      },
    });
    expect(payload?.kind).toBe('line_chart');
  });

  it('parses a progress_dots envelope', () => {
    const payload = coerceRenderPayload({
      version: 1,
      kind: 'progress_dots',
      data: {
        kind: 'progress_dots',
        filled: 3,
        total: 8,
        label: 'sets',
      },
    });
    expect(payload?.kind).toBe('progress_dots');
  });

  it('parses an arc_graph envelope', () => {
    const payload = coerceRenderPayload({
      version: 1,
      kind: 'arc_graph',
      data: {
        kind: 'arc_graph',
        label: 'kcal',
        arc: { min: 0, max: 2200, current: 1780 },
      },
    });
    expect(payload?.kind).toBe('arc_graph');
  });

  it('parses a data_table envelope', () => {
    const payload = coerceRenderPayload({
      version: 1,
      kind: 'data_table',
      data: {
        kind: 'data_table',
        columns: ['Day', 'kcal'],
        rows: [
          ['Mon', 2000],
          ['Tue', 2100],
        ],
      },
    });
    expect(payload?.kind).toBe('data_table');
  });

  it('parses a metric_grid envelope', () => {
    const payload = coerceRenderPayload({
      version: 1,
      kind: 'metric_grid',
      data: {
        kind: 'metric_grid',
        items: [
          { label: 'W', value: 78.4, unit: 'kg' },
          { label: 'kcal', value: 1780, delta: -220 },
        ],
      },
    });
    expect(payload?.kind).toBe('metric_grid');
  });
});

/* ── bare payload (rehydrated / older shape) ──────────────────────────── */

describe('coerceRenderPayload — bare payload fallback', () => {
  it('accepts a bare stat_ticker payload (no envelope wrapper)', () => {
    // If a caller stores just the render payload (no version + kind
    // envelope), the coercer should still recognize it via the fallback
    // `candidate = withData.data ?? output` path.
    const payload = coerceRenderPayload({
      kind: 'stat_ticker',
      label: 'W',
      value: '78.4',
      delta: -0.3,
    });
    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe('stat_ticker');
    if (payload?.kind === 'stat_ticker') {
      expect(payload.label).toBe('W');
      expect(payload.delta).toBe(-0.3);
    }
  });

  it('accepts a bare metric_grid payload', () => {
    const payload = coerceRenderPayload({
      kind: 'metric_grid',
      items: [{ label: 'W', value: 78 }],
    });
    expect(payload?.kind).toBe('metric_grid');
  });
});

/* ── fallback / rejection behavior ────────────────────────────────────── */

describe('coerceRenderPayload — rejection', () => {
  it('returns null for null input', () => {
    expect(coerceRenderPayload(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(coerceRenderPayload(undefined)).toBeNull();
  });

  it('returns null for an empty object', () => {
    expect(coerceRenderPayload({})).toBeNull();
  });

  it('returns null for a string input', () => {
    expect(coerceRenderPayload('render me please')).toBeNull();
  });

  it('returns null for an unknown kind', () => {
    expect(
      coerceRenderPayload({
        kind: 'render_unknown',
        label: 'x',
        value: 1,
      }),
    ).toBeNull();
  });

  it('returns null when the envelope has a valid kind but malformed data', () => {
    // Envelope kind says stat_ticker, but data is missing the required
    // `label` field — should fail schema validation and return null.
    expect(
      coerceRenderPayload({
        version: 1,
        kind: 'stat_ticker',
        data: {
          kind: 'stat_ticker',
          value: '78.4',
          // label missing
        },
      }),
    ).toBeNull();
  });

  it('returns null when a required nested field is the wrong type', () => {
    // arc_graph requires arc.current to be finite; passing NaN should fail.
    expect(
      coerceRenderPayload({
        kind: 'arc_graph',
        label: 'kcal',
        arc: { min: 0, max: 100, current: 'oops' },
      }),
    ).toBeNull();
  });
});
