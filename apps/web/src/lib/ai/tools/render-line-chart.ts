/**
 * render_line_chart — one-shot generative UI tool.
 *
 * Renders as `<PixelLineChart>` inside a `<PixelCard>`. Ideal for
 * time-series (weight trend, adherence over weeks). Single-series only —
 * for multi-series comparisons, use `render_bar_chart` with grouped bars.
 */
import { tool } from 'ai';
import { z } from 'zod';

const inputSchema = z.object({
  title: z.string().max(80).optional().describe('Optional uppercase eyebrow — e.g. "WEIGHT TREND — LAST 4 WEEKS"'),
  xLabels: z
    .array(z.string().max(40))
    .min(2)
    .max(20)
    .describe('Time-axis labels — one per data point (e.g. week labels, date shorts)'),
  values: z
    .array(z.number())
    .min(2)
    .max(60)
    .describe('One value per xLabel — same length as xLabels'),
  units: z.string().max(40).optional().describe('Unit shown next to the title — e.g. "kg"'),
  showArea: z
    .boolean()
    .optional()
    .describe('If true, fills the area beneath the line with a stippled cadmium pattern.'),
  markers: z
    .array(z.number().int().min(0))
    .max(20)
    .optional()
    .describe('Optional indices to highlight (0-based into xLabels) — e.g. workout days'),
});

type Input = z.infer<typeof inputSchema>;

export function makeRenderLineChartTool() {
  return tool({
    description:
      'Render a time-series line chart (values over time as connected pixel points). Use for weight trends, adherence over weeks, streak length over months, etc.',
    inputSchema,
    async execute(input: Input) {
      return {
        version: 1 as const,
        kind: 'line_chart' as const,
        data: { kind: 'line_chart' as const, ...input },
      };
    },
  });
}
