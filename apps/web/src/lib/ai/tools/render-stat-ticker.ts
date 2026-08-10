/**
 * render_stat_ticker — one-shot generative UI tool.
 *
 * Returns a `stat_ticker` render payload the client mounts as a
 * `<PixelTicker>` inside a `<PixelCard>`. No side effects, no DB writes,
 * no rate-limit budget — the tool exists purely to move a structured
 * payload from the model into the render pipeline.
 *
 * Use this whenever the assistant wants to answer with ONE big number:
 * remaining kcals, current weight, streak length, etc.
 */
import { tool } from 'ai';
import { z } from 'zod';

const inputSchema = z.object({
  label: z.string().min(1).max(80).describe('Short uppercase eyebrow — e.g. "WEIGHT" or "KCAL LEFT"'),
  value: z
    .union([z.number(), z.string().max(80)])
    .describe('The main readout — number preferred; string allowed for e.g. "12h 04m"'),
  delta: z
    .number()
    .optional()
    .describe('Absolute delta since the previous reading — positive up, negative down'),
  deltaPct: z
    .number()
    .optional()
    .describe('Percentage delta as a raw number (e.g. 3.2 for +3.2%). Prefer `delta` when the unit is meaningful.'),
  unit: z.string().max(40).optional().describe('Unit label — e.g. "kg", "kcal", "min"'),
  sparkline: z
    .array(z.number())
    .max(60)
    .optional()
    .describe('Recent history for the sparkline — 2–8 datapoints ideal; longer arrays are truncated.'),
});

type Input = z.infer<typeof inputSchema>;

export function makeRenderStatTickerTool() {
  return tool({
    description:
      'Render a single hero-number readout (e.g. remaining kcals, current weight, streak length). Prefer this over writing "You have 420 kcal left" as prose — the client renders it as a pixel-panel ticker in the Nothing OS aesthetic.',
    inputSchema,
    async execute(input: Input) {
      return {
        version: 1 as const,
        kind: 'stat_ticker' as const,
        data: { kind: 'stat_ticker' as const, ...input },
      };
    },
  });
}
