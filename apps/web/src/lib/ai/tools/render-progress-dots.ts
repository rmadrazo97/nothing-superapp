/**
 * render_progress_dots — one-shot generative UI tool.
 *
 * Renders as `<PixelProgressDots>` inside a `<PixelCard>`. One row of
 * squares, filled cadmium up to `filled/total`. Ideal for X-of-Y readings:
 * kcal remaining, streak days, macros left, adherence.
 */
import { tool } from 'ai';
import { z } from 'zod';

const inputSchema = z.object({
  filled: z
    .number()
    .int()
    .min(0)
    .max(400)
    .describe('Number of filled (cadmium) dots. Must be ≤ total.'),
  total: z
    .number()
    .int()
    .min(1)
    .max(400)
    .describe('Total number of dots. Auto-wraps beyond 40.'),
  label: z.string().max(80).optional().describe('Optional label — e.g. "KCAL LEFT" or "STREAK"'),
  unit: z.string().max(40).optional().describe('Unit suffix — e.g. "kcal", "days"'),
});

type Input = z.infer<typeof inputSchema>;

export function makeRenderProgressDotsTool() {
  return tool({
    description:
      'Render an X-of-Y progress dot-row (each dot = one unit; filled cadmium up to `filled`, muted for the rest). Use for "kcal left today", "streak days", "workouts this week", "macros remaining". Prefer this over prose like "You have 12 of 30 days" when the ratio is the story.',
    inputSchema,
    async execute(input: Input) {
      // Clamp defensively — model could theoretically send filled > total
      const clamped = {
        ...input,
        filled: Math.min(input.filled, input.total),
      };
      return {
        version: 1 as const,
        kind: 'progress_dots' as const,
        data: { kind: 'progress_dots' as const, ...clamped },
      };
    },
  });
}
