/**
 * Zod schemas for the pixel-ui generative surface (v0.5.4).
 *
 * These schemas are the SINGLE source of truth for the shape of every
 * `render_*` tool's output. They are:
 *   1. Used by each tool's `inputSchema` (the model calls the tool with
 *      exactly this shape).
 *   2. Used defensively at the render site (`CopilotChat.tsx`) so a
 *      malformed cached / rehydrated tool part can't crash the chat.
 *
 * Clamp rules — designed so a hostile / accidentally-huge tool call can't
 * blow up layout:
 *   - Chart series values arrays capped at 60 datapoints
 *   - Label / string fields capped at 80 chars
 *   - Data table capped at 40 rows × 8 columns
 *
 * Every schema has a companion `kind` literal so the discriminated union
 * at the render site can switch on `data.kind` without prop-shape lookups.
 */
import { z } from 'zod';

const shortString = z.string().max(80);
const veryShortString = z.string().max(40);
const numericArray = z.array(z.number().finite()).max(60);

/* ── stat_ticker ─────────────────────────────────────────────────────── */

export const statTickerSchema = z.object({
  kind: z.literal('stat_ticker'),
  label: shortString,
  value: z.union([z.number().finite(), shortString]),
  /** Absolute delta, positive OR negative. */
  delta: z.number().finite().optional(),
  /** Percentage delta as a raw number (e.g. 3.2 for +3.2%). */
  deltaPct: z.number().finite().optional(),
  unit: veryShortString.optional(),
  /** 2–8 datapoints. Longer arrays are truncated at render time. */
  sparkline: numericArray.optional(),
});
export type StatTickerData = z.infer<typeof statTickerSchema>;

/* ── bar_chart ───────────────────────────────────────────────────────── */

export const barSeriesSchema = z.object({
  label: shortString,
  values: numericArray,
});

export const barChartSchema = z.object({
  kind: z.literal('bar_chart'),
  title: shortString.optional(),
  xLabels: z.array(veryShortString).max(20),
  series: z.array(barSeriesSchema).min(1).max(4),
  units: veryShortString.optional(),
});
export type BarChartData = z.infer<typeof barChartSchema>;

/* ── line_chart ──────────────────────────────────────────────────────── */

export const lineChartSchema = z.object({
  kind: z.literal('line_chart'),
  title: shortString.optional(),
  xLabels: z.array(veryShortString).max(20),
  values: numericArray,
  units: veryShortString.optional(),
  showArea: z.boolean().optional(),
  markers: z.array(z.number().int().min(0)).max(20).optional(),
});
export type LineChartData = z.infer<typeof lineChartSchema>;

/* ── progress_dots ───────────────────────────────────────────────────── */

export const progressDotsSchema = z.object({
  kind: z.literal('progress_dots'),
  filled: z.number().int().min(0).max(400),
  total: z.number().int().min(1).max(400),
  label: shortString.optional(),
  unit: veryShortString.optional(),
});
export type ProgressDotsData = z.infer<typeof progressDotsSchema>;

/* ── arc_graph ───────────────────────────────────────────────────────── */

export const arcGraphSchema = z.object({
  kind: z.literal('arc_graph'),
  label: shortString,
  arc: z.object({
    min: z.number().finite(),
    max: z.number().finite(),
    current: z.number().finite(),
  }),
  /** Optional marker positions in the [min, max] range, drawn as ticks. */
  markers: z.array(z.number().finite()).max(12).optional(),
  unit: veryShortString.optional(),
});
export type ArcGraphData = z.infer<typeof arcGraphSchema>;

/* ── data_table ──────────────────────────────────────────────────────── */

export const dataTableSchema = z.object({
  kind: z.literal('data_table'),
  title: shortString.optional(),
  columns: z.array(veryShortString).min(1).max(8),
  rows: z
    .array(
      z.array(z.union([z.string().max(120), z.number().finite(), z.null()])).max(8),
    )
    .max(40),
  compact: z.boolean().optional(),
});
export type DataTableData = z.infer<typeof dataTableSchema>;

/* ── metric_grid ─────────────────────────────────────────────────────── */

export const metricGridItemSchema = z.object({
  label: shortString,
  value: z.union([z.number().finite(), shortString]),
  unit: veryShortString.optional(),
  delta: z.number().finite().optional(),
});

export const metricGridSchema = z.object({
  kind: z.literal('metric_grid'),
  title: shortString.optional(),
  items: z.array(metricGridItemSchema).min(1).max(6),
});
export type MetricGridData = z.infer<typeof metricGridSchema>;

/* ── discriminated union across all render kinds ─────────────────────── */

export const renderPayloadSchema = z.discriminatedUnion('kind', [
  statTickerSchema,
  barChartSchema,
  lineChartSchema,
  progressDotsSchema,
  arcGraphSchema,
  dataTableSchema,
  metricGridSchema,
]);

export type RenderPayload = z.infer<typeof renderPayloadSchema>;

/**
 * Envelope every render tool returns. The `version` lets us evolve the
 * shape later without a breaking rename.
 */
export const renderEnvelopeSchema = z.object({
  version: z.literal(1),
  kind: z.string(),
  data: renderPayloadSchema,
});
export type RenderEnvelope = z.infer<typeof renderEnvelopeSchema>;

/**
 * Safely coerce a tool part's `output` field to a `RenderPayload`, or
 * return null if the shape doesn't match. Used defensively at the render
 * site — tool outputs are trusted (we generated them) but the same code
 * path handles rehydrated messages from the DB which could theoretically
 * be older shapes.
 */
export function coerceRenderPayload(output: unknown): RenderPayload | null {
  if (!output || typeof output !== 'object') return null;
  const withData = output as { data?: unknown };
  const candidate = withData.data ?? output;
  const parsed = renderPayloadSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
