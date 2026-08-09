/**
 * Reminders — resource declarations for the Mini-App Resource Framework.
 *
 * Declares two resources:
 *   - `reminders` — CRUD. The framework strips server-owned columns
 *     (id, user_id, created_at, updated_at, last_fired_at, next_fire_at)
 *     from insert/update payloads.
 *   - `runs` — read-only + delete (users can clear history). Writes come
 *     from the tick handler with service_role.
 *
 * `agent.describe` copy is written for the LLM — it's how the copilot
 * discovers what reminders can do without a hand-written tool per verb.
 */
import {
  computeNextFireAt,
  reminderInsertSchema,
  reminderRunSchema,
  reminderSchema,
  reminderUpdateSchema,
  type MiniAppResourceModule,
  type ReminderScheduleInput,
} from '@nothing/shared';

const module: MiniAppResourceModule = {
  slug: 'reminders',
  resources: [
    {
      name: 'reminders',
      table: 'reminders',
      rowSchema: reminderSchema,
      insertSchema: reminderInsertSchema,
      updateSchema: reminderUpdateSchema,
      orderBy: { column: 'next_fire_at', ascending: true },
      filterableColumns: ['active', 'kind', 'schedule_kind'],
      ops: { list: true, get: true, create: true, update: true, delete: true },
      // Auto-fill next_fire_at on every create + update so the tick handler
      // can filter cheap. `beforeWrite` runs AFTER Zod-validate and AFTER
      // reserved-column stripping — a rogue client can't set next_fire_at.
      beforeWrite: async (row) => {
        const r = row as Record<string, unknown> & Partial<ReminderScheduleInput>;
        if (r.schedule_kind) {
          const next = computeNextFireAt(
            {
              schedule_kind: r.schedule_kind,
              schedule_at: (r.schedule_at as string | null | undefined) ?? null,
              schedule_time: (r.schedule_time as string | null | undefined) ?? null,
              schedule_dow: (r.schedule_dow as number[] | null | undefined) ?? null,
              schedule_dom: (r.schedule_dom as number | null | undefined) ?? null,
              schedule_cron: (r.schedule_cron as string | null | undefined) ?? null,
              timezone: (r.timezone as string | null | undefined) ?? 'UTC',
            },
            new Date(),
          );
          (r as Record<string, unknown>).next_fire_at = next;
        }
        return row;
      },
      agent: {
        describe:
          "The user's reminders. Two modes: 'notify' (plain push at the scheduled time) and 'agent_loop' (an autonomous copilot prompt that runs on the schedule and pushes the result). Schedule shapes: once (needs schedule_at ISO), daily (schedule_time HH:MM), weekly (schedule_time + schedule_dow[]), monthly (schedule_dom 1-31), cron (schedule_cron raw string). For agent_loop reminders, set agent_task = { prompt, context?, model?, max_steps? }.",
        describeOps: {
          create:
            "Create a reminder. Prefer 'agent_loop' when the user wants a scheduled AI check-in (e.g. 'review my calories every Sunday'). Use 'notify' for plain nudges. Always set timezone to the user's IANA zone.",
          update:
            'Update a reminder. Toggle `active` to pause/resume without deleting the schedule.',
          delete:
            'Delete a reminder permanently. Confirm with the user first — cascades to reminder_runs.',
        },
      },
    },
    {
      name: 'runs',
      table: 'reminder_runs',
      rowSchema: reminderRunSchema,
      insertSchema: reminderRunSchema.partial(),
      orderBy: { column: 'fired_at', ascending: false },
      filterableColumns: ['reminder_id', 'status', 'kind'],
      ops: { list: true, get: true, delete: true },
      agent: {
        describe:
          "Audit log of past reminder fires. Each row records timestamp, status (ok/error/skipped), the agent's summary (for agent_loop kind), and a link to the copilot thread when persisted. Read this to answer 'what did my Sunday review say last week?' or 'why did my drink-water reminder skip yesterday?'.",
      },
    },
  ],
};

export default module;
