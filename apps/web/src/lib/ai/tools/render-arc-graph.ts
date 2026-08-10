/**
 * render_arc_graph — one-shot generative UI tool.
 *
 * Renders as `<PixelArc>` inside a `<PixelCard>`. 180° arc with a filled
 * cadmium marker sliding along it. Use for cyclic readings — pomodoro
 * cycle progress, sunrise/sunset positions, timer countdowns rendered as
 * "position on the cycle".
 *
 * NOT a general-purpose gauge — for X-of-Y use `render_progress_dots`.
 */
import { tool } from 'ai';
import { z } from 'zod';

const inputSchema = z.object({
  label: z.string().min(1).max(80).describe('Uppercase eyebrow — e.g. "POMODORO · CYCLE 3/4"'),
  arc: z.object({
    min: z.number().describe('Minimum value along the arc — e.g. 0'),
    max: z.number().describe('Maximum value along the arc — e.g. 25 (minutes) or 4 (cycles)'),
    current: z.number().describe('Current position — clamped into [min, max]'),
  }),
  markers: z
    .array(z.number())
    .max(12)
    .optional()
    .describe('Optional tick positions along the arc (in the [min, max] range)'),
  unit: z.string().max(40).optional().describe('Unit shown beneath the center number — e.g. "MIN"'),
});

type Input = z.infer<typeof inputSchema>;

export function makeRenderArcGraphTool() {
  return tool({
    description:
      'Render an arc-graph (180° track with a marker sliding along it). Use for cyclic values: pomodoro cycle progress, sunrise/sunset time position, focus-session countdown. NOT for simple X-of-Y — use render_progress_dots instead.',
    inputSchema,
    async execute(input: Input) {
      return {
        version: 1 as const,
        kind: 'arc_graph' as const,
        data: { kind: 'arc_graph' as const, ...input },
      };
    },
  });
}
