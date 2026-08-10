/**
 * render_bar_chart — one-shot generative UI tool.
 *
 * Renders as `<PixelBarChart>` inside a `<PixelCard>`. Ideal for comparing
 * categories (exercises, meals, days). Supports 1–4 series (grouped or
 * stacked); each series is a plain values array aligned to `xLabels`.
 *
 * No side effects. The model should call this INSTEAD of writing a
 * markdown pipe table (which renders as raw text in the chat) or an
 * ASCII bar chart (which reads like 1998).
 */
import { tool } from 'ai';
import { z } from 'zod';

const seriesSchema = z.object({
  label: z.string().min(1).max(80).describe('Series name — e.g. "kg" or "sets"'),
  values: z
    .array(z.number())
    .min(1)
    .max(60)
    .describe('Value per x-axis label — must be the same length as xLabels'),
});

const inputSchema = z.object({
  title: z.string().max(80).optional().describe('Optional uppercase eyebrow — e.g. "WEIGHTS LIFTED — LAST SESSION"'),
  xLabels: z
    .array(z.string().max(40))
    .min(1)
    .max(20)
    .describe('X-axis category labels — 2–12 items ideal, max 20'),
  series: z
    .array(seriesSchema)
    .min(1)
    .max(4)
    .describe('One entry per series. 1 series = simple bar chart; 2–4 series = grouped bars.'),
  units: z.string().max(40).optional().describe('Overall unit shown next to the title — e.g. "kg"'),
});

type Input = z.infer<typeof inputSchema>;

export function makeRenderBarChartTool() {
  return tool({
    description:
      'Render a comparison bar chart (categories on x-axis, values as pixel-stack bars). Use for "weights per exercise", "meals per day", "calories per meal", etc. Always prefer this over a markdown table when the data is quantitative and comparable.',
    inputSchema,
    async execute(input: Input) {
      return {
        version: 1 as const,
        kind: 'bar_chart' as const,
        data: { kind: 'bar_chart' as const, ...input },
      };
    },
  });
}
