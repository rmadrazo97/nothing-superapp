/**
 * Pomodoro — resource declarations for the Mini-App Resource Framework.
 *
 * Proves the framework works for a shape that isn't calorie-shaped:
 *   - Server-owned timestamps (`started_at`, `ended_at`) are stripped from
 *     the insert payload by the framework — the DB fills them by default,
 *     the hand-written route did a more nuanced clamp-window; the framework
 *     equivalent is simpler ("server clock wins") which is acceptable for a
 *     copilot-driven "start a pomodoro" workflow.
 *   - Only `list` + `create` are enabled. Pomodoro rows are historical
 *     receipts — never edited, never manually deleted through the mini-app UI.
 */
import {
  newPomodoroSessionSchema,
  pomodoroSessionSchema,
  type MiniAppResourceModule,
} from '@nothing/shared';

const module: MiniAppResourceModule = {
  slug: 'pomodoro',
  resources: [
    {
      name: 'sessions',
      table: 'pomodoro_sessions',
      rowSchema: pomodoroSessionSchema,
      insertSchema: newPomodoroSessionSchema,
      orderBy: { column: 'started_at', ascending: false },
      filterableColumns: ['phase', 'completed'],
      ops: { list: true, get: true, create: true },
      agent: {
        describe:
          'Focus sessions the user has completed (or aborted). Each row records the phase (work / short_break / long_break), planned vs actual duration in seconds, and completion flag.',
        describeOps: {
          create:
            'Record a completed pomodoro session. Use when the user says "I just did a 25-minute focus block" or similar — set phase=work, planned/actual duration in seconds.',
          list: 'List recent focus sessions. Useful for "how many pomodoros today?" or "how focused was I this week?" questions.',
        },
      },
    },
  ],
};

export default module;
