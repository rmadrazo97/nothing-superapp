/**
 * Gym Routine — resource declarations for the Mini-App Resource Framework.
 *
 * Declares one resource so far:
 *
 *   - `body-metrics` — weekly weight + tape-measure log (task #90).
 *     Backing table `public.body_metrics` per migration 021. Storage is
 *     canonical mm + g integers; UI + copilot convert to the user's chosen
 *     units (see gym-routine/settings.tsx → weightUnit / lengthUnit).
 *
 * Framework auto-generates:
 *   - REST at /api/mini-apps/gym-routine/resources/body-metrics
 *   - Copilot tools: gym_routine_body_metrics_{list,get,create,update,delete}
 *   - Client hook: useResource<BodyMetric>('gym-routine', 'body-metrics')
 *
 * Sessions / routines / exercises intentionally stay hand-written for now —
 * they predate the framework and a migration is a separate wave.
 */
import {
  bodyMetricInsertSchema,
  bodyMetricSchema,
  bodyMetricUpdateSchema,
  type MiniAppResourceModule,
} from '@nothing/shared';

const module: MiniAppResourceModule = {
  slug: 'gym-routine',
  resources: [
    {
      name: 'body-metrics',
      table: 'body_metrics',
      rowSchema: bodyMetricSchema,
      insertSchema: bodyMetricInsertSchema,
      updateSchema: bodyMetricUpdateSchema,
      orderBy: { column: 'measured_at', ascending: false },
      filterableColumns: ['iso_week'],
      ops: { list: true, get: true, create: true, update: true, delete: true },
      agent: {
        describe:
          "Weekly body composition entries — one row per weigh-in. Six measurements: glutes / waist (at navel) / chest / thighs / biceps (all in millimetres) + weight (in grams). `iso_week` is the ISO 8601 week key like '2026-W32' and is the primary bucket for trend queries. `notes` is a freeform 1000-char field.",
        describeOps: {
          create:
            "Log a body measurements entry. Values are stored in canonical mm + g — convert BEFORE calling: inches → mm = round(in * 25.4); cm → mm = round(cm * 10); lbs → g = round(lbs * 453.59237); kg → g = round(kg * 1000). `iso_week` defaults to the current ISO week if you don't set it; leave `measured_at` unset and the DB stamps now(). All six measurement fields are optional — the user may log only weight some weeks.",
          update:
            'Update an existing measurement entry. Same unit convention as create: mm + g.',
          delete:
            'Delete a measurement entry permanently. Confirm with the user first — no soft delete.',
        },
        emitEvent: 'body_metric_added',
      },
    },
  ],
};

export default module;
