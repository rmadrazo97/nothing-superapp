/**
 * Reminders mini-app schemas (migration 017).
 *
 * Two-mode reminders:
 *   - `notify` — plain push at the scheduled time.
 *   - `agent_loop` — autonomous copilot prompt that runs on the schedule
 *     and pushes its summary to the user. This is the killer differentiator:
 *     a reminder that can actually _do_ something.
 *
 * Schedule shape is a discriminated field (`schedule_kind`) with per-shape
 * required columns. Cross-field .refine()s below enforce required-ness on
 * the API boundary — the DB check constraints only enforce the values
 * themselves.
 *
 * Ordering matters: this module exports both Zod schemas AND TS types. The
 * types are inferred (never hand-typed) so drift is impossible.
 */
import { z } from 'zod';

// ─── enums ────────────────────────────────────────────────────────────────

export const reminderKindEnum = z.enum(['notify', 'agent_loop']);
export const scheduleKindEnum = z.enum([
  'once',
  'daily',
  'weekly',
  'monthly',
  'cron',
]);
export const reminderRunStatusEnum = z.enum(['ok', 'error', 'skipped']);

// ─── agent-loop payload ───────────────────────────────────────────────────
// Shape stored in `reminders.agent_task` (jsonb). Only populated when
// `kind === 'agent_loop'`.

export const agentTaskSchema = z.object({
  prompt: z
    .string()
    .min(1, 'Agent-loop prompt is required.')
    .max(4000, 'Agent-loop prompt must be under 4000 characters.'),
  /** Optional mini-app scope, mirrors copilot POST body — e.g. 'calorie-lite'. */
  context: z.string().max(64).optional(),
  /** Model override — leave null to default to `KIMI_MODEL`. */
  model: z.string().max(128).optional(),
  /** Bound the loop. Default 5 — matches the copilot route's step cap. */
  max_steps: z.number().int().min(1).max(10).default(5).optional(),
});

// ─── HH:MM helper (24h, no seconds) ───────────────────────────────────────
const timeHhMm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'schedule_time must be HH:MM (24h).');

// ─── reminder row ─────────────────────────────────────────────────────────

export const reminderSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  notes: z.string().nullable().optional(),
  kind: reminderKindEnum,
  schedule_kind: scheduleKindEnum,
  schedule_at: z.string().datetime({ offset: true }).nullable().optional(),
  schedule_time: timeHhMm.nullable().optional(),
  schedule_dow: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  schedule_dom: z.number().int().min(1).max(31).nullable().optional(),
  schedule_cron: z.string().min(1).max(120).nullable().optional(),
  timezone: z.string().min(1).max(64).default('UTC'),
  agent_task: agentTaskSchema.nullable().optional(),
  push_topic: z.string().min(1).max(64).default('reminders'),
  active: z.boolean().default(true),
  last_fired_at: z.string().datetime({ offset: true }).nullable().optional(),
  next_fire_at: z.string().datetime({ offset: true }).nullable().optional(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

// Cross-field required-ness: express once, re-use for insert + update.
function refineScheduleShape<T extends z.ZodTypeAny>(schema: T): T {
  return (schema as unknown as z.ZodEffects<T>)
    .superRefine((val: any, ctx: z.RefinementCtx) => {
      const kind = val.schedule_kind as z.infer<typeof scheduleKindEnum> | undefined;
      if (!kind) return;
      if (kind === 'once' && !val.schedule_at) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule_at'],
          message: 'schedule_at is required for schedule_kind=once.',
        });
      }
      if (kind === 'daily' && !val.schedule_time) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule_time'],
          message: 'schedule_time is required for schedule_kind=daily.',
        });
      }
      if (kind === 'weekly') {
        if (!val.schedule_time) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schedule_time'],
            message: 'schedule_time is required for schedule_kind=weekly.',
          });
        }
        if (!Array.isArray(val.schedule_dow) || val.schedule_dow.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schedule_dow'],
            message: 'schedule_dow (at least one weekday) required for schedule_kind=weekly.',
          });
        }
      }
      if (kind === 'monthly' && (val.schedule_dom == null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule_dom'],
          message: 'schedule_dom is required for schedule_kind=monthly.',
        });
      }
      if (kind === 'cron' && !val.schedule_cron) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule_cron'],
          message: 'schedule_cron is required for schedule_kind=cron.',
        });
      }
      if (val.kind === 'agent_loop') {
        const task = val.agent_task as z.infer<typeof agentTaskSchema> | null | undefined;
        if (!task || !task.prompt || task.prompt.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['agent_task', 'prompt'],
            message: 'agent_task.prompt is required for kind=agent_loop.',
          });
        }
      }
    }) as unknown as T;
}

// Insert payload: client sends these fields. `id`, `user_id`, timestamps,
// last_fired_at, next_fire_at are server-owned and stripped by the resource
// framework before insert.
export const reminderInsertSchema = refineScheduleShape(
  z.object({
    title: z.string().min(1).max(200),
    notes: z.string().max(2000).nullable().optional(),
    kind: reminderKindEnum,
    schedule_kind: scheduleKindEnum,
    schedule_at: z.string().datetime({ offset: true }).nullable().optional(),
    schedule_time: timeHhMm.nullable().optional(),
    schedule_dow: z.array(z.number().int().min(0).max(6)).nullable().optional(),
    schedule_dom: z.number().int().min(1).max(31).nullable().optional(),
    schedule_cron: z.string().min(1).max(120).nullable().optional(),
    timezone: z.string().min(1).max(64).default('UTC').optional(),
    agent_task: agentTaskSchema.nullable().optional(),
    push_topic: z.string().min(1).max(64).default('reminders').optional(),
    active: z.boolean().default(true).optional(),
  }),
);

// Update payload: all fields optional; if `schedule_kind` is present, the
// per-shape required column must be present too (still enforced by refine).
export const reminderUpdateSchema = refineScheduleShape(
  z.object({
    title: z.string().min(1).max(200).optional(),
    notes: z.string().max(2000).nullable().optional(),
    kind: reminderKindEnum.optional(),
    schedule_kind: scheduleKindEnum.optional(),
    schedule_at: z.string().datetime({ offset: true }).nullable().optional(),
    schedule_time: timeHhMm.nullable().optional(),
    schedule_dow: z.array(z.number().int().min(0).max(6)).nullable().optional(),
    schedule_dom: z.number().int().min(1).max(31).nullable().optional(),
    schedule_cron: z.string().min(1).max(120).nullable().optional(),
    timezone: z.string().min(1).max(64).optional(),
    agent_task: agentTaskSchema.nullable().optional(),
    push_topic: z.string().min(1).max(64).optional(),
    active: z.boolean().optional(),
  }),
);

// ─── reminder_runs ────────────────────────────────────────────────────────

export const reminderRunSchema = z.object({
  id: z.string().uuid(),
  reminder_id: z.string().uuid(),
  user_id: z.string().uuid(),
  fired_at: z.string().datetime({ offset: true }),
  kind: reminderKindEnum,
  status: reminderRunStatusEnum,
  agent_summary: z.string().nullable().optional(),
  agent_thread_id: z.string().uuid().nullable().optional(),
  push_sent: z.boolean().default(false),
  error_message: z.string().nullable().optional(),
});

// ─── inferred types ───────────────────────────────────────────────────────

export type ReminderKind = z.infer<typeof reminderKindEnum>;
export type ScheduleKind = z.infer<typeof scheduleKindEnum>;
export type ReminderRunStatus = z.infer<typeof reminderRunStatusEnum>;
export type AgentTask = z.infer<typeof agentTaskSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type ReminderInsert = z.infer<typeof reminderInsertSchema>;
export type ReminderUpdate = z.infer<typeof reminderUpdateSchema>;
export type ReminderRun = z.infer<typeof reminderRunSchema>;
