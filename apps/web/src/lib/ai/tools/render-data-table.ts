/**
 * render_data_table — one-shot generative UI tool.
 *
 * Renders as `<PixelDataTable>` inside a `<PixelCard>`. Mono type,
 * hairline row separators, right-aligned numerics. Use INSTEAD of markdown
 * pipe tables (which don't render in `markdown-lite`).
 */
import { tool } from 'ai';
import { z } from 'zod';

const inputSchema = z.object({
  title: z.string().max(80).optional().describe('Optional uppercase eyebrow — e.g. "OPTIONS — LUNCH"'),
  columns: z
    .array(z.string().max(40))
    .min(1)
    .max(8)
    .describe('Column headers — first column is treated as the row label (left-aligned); the rest are numerics (right-aligned)'),
  rows: z
    .array(
      z
        .array(z.union([z.string().max(120), z.number(), z.null()]))
        .min(1)
        .max(8),
    )
    .min(1)
    .max(40)
    .describe('Row data — one array per row, same length as `columns`. Nulls print as "—".'),
  compact: z.boolean().optional().describe('Tighter row padding — use for tables with >12 rows'),
});

type Input = z.infer<typeof inputSchema>;

export function makeRenderDataTableTool() {
  return tool({
    description:
      'Render a structured data table (mono type, hairline row separators, right-aligned numerics). ALWAYS use this instead of markdown pipe tables — the client\'s markdown renderer does not support tables and prints them as raw text.',
    inputSchema,
    async execute(input: Input) {
      return {
        version: 1 as const,
        kind: 'data_table' as const,
        data: { kind: 'data_table' as const, ...input },
      };
    },
  });
}
