/**
 * render_metric_grid — one-shot generative UI tool.
 *
 * Renders as `<PixelMetricGrid>` inside a `<PixelCard>`. A 2-column grid
 * of mini-tickers (label + 24px Doto value + optional delta). Ideal for
 * weekly summaries with 3–6 related metrics.
 */
import { tool } from 'ai';
import { z } from 'zod';

const itemSchema = z.object({
  label: z.string().min(1).max(80).describe('Uppercase eyebrow — e.g. "KCAL" or "PROTEIN"'),
  value: z.union([z.number(), z.string().max(80)]).describe('The numeric readout for this cell'),
  unit: z.string().max(40).optional().describe('Unit label — e.g. "g", "kcal"'),
  delta: z.number().optional().describe('Absolute delta vs previous period — positive up, negative down'),
});

const inputSchema = z.object({
  title: z.string().max(80).optional().describe('Optional uppercase eyebrow — e.g. "THIS WEEK"'),
  items: z
    .array(itemSchema)
    .min(1)
    .max(6)
    .describe('1–6 items. 2 items = 2×1, 4 items = 2×2, 6 items = 2×3.'),
  negativeDeltaTone: z
    .enum(['accent', 'muted'])
    .optional()
    .describe(
      'Color for negative delta chips. "accent" (default) = cadmium red. "muted" = graphite, for use inside cards whose LED signature is already cadmium so the negative chip does not compete.',
    ),
});

type Input = z.infer<typeof inputSchema>;

export function makeRenderMetricGridTool() {
  return tool({
    description:
      'Render a 2-column grid of related metrics with optional deltas. Use for weekly / monthly summaries where 3–6 metrics matter equally (e.g. macros summary, workout volume by category, adherence dashboard).',
    inputSchema,
    async execute(input: Input) {
      return {
        version: 1 as const,
        kind: 'metric_grid' as const,
        data: { kind: 'metric_grid' as const, ...input },
      };
    },
  });
}
