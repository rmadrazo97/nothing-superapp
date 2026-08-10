/**
 * pixel-ui — the assistant's generative surface (v0.5.4).
 *
 * See services/growth/campaigns/nothing-superapp/design/pixel-ui-v0.5.4.md
 * for the design brief. Every component here is a client component that
 * takes typed props matching the exact shape of one of the `render_*`
 * tools in `apps/web/src/lib/ai/tools/render-*.ts`.
 *
 * Wire-up path: the assistant calls e.g. `render_bar_chart`; the tool
 * returns `{version: 1, kind: 'bar_chart', data: {...}}`; CopilotChat's
 * render loop switches on `data.kind` and mounts the matching component
 * wrapped in `<PixelCard>`.
 */

export { PixelCard } from './PixelCard';
export { PixelTicker } from './PixelTicker';
export { PixelBarChart } from './PixelBarChart';
export { PixelLineChart } from './PixelLineChart';
export { PixelProgressDots } from './PixelProgressDots';
export { PixelArc } from './PixelArc';
export { PixelDataTable } from './PixelDataTable';
export { PixelMetricGrid } from './PixelMetricGrid';

export {
  coerceRenderPayload,
  renderPayloadSchema,
  renderEnvelopeSchema,
  statTickerSchema,
  barChartSchema,
  lineChartSchema,
  progressDotsSchema,
  arcGraphSchema,
  dataTableSchema,
  metricGridSchema,
} from './schemas';

export type {
  RenderPayload,
  RenderEnvelope,
  StatTickerData,
  BarChartData,
  LineChartData,
  ProgressDotsData,
  ArcGraphData,
  DataTableData,
  MetricGridData,
} from './schemas';
