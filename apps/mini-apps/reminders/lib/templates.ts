/**
 * 6 canned reminder templates. First tap in "◐ TEMPLATES" pre-fills the
 * form — user reviews, saves.
 *
 * Balance: 3 notify, 3 agent loops. Agent loops call out to real data
 * inside the user's other mini-apps (calorie-lite, gym-routine, meal-plans).
 */
import type { ReminderKind, ScheduleKind } from '@nothing/shared';

export interface Template {
  title: string;
  notes?: string;
  kind: ReminderKind;
  schedule_kind: ScheduleKind;
  schedule_at?: string;
  schedule_time?: string;
  schedule_dow?: number[];
  schedule_dom?: number;
  schedule_cron?: string;
  agent_prompt?: string;
  agent_context?: string;
}

export const TEMPLATES: Template[] = [
  {
    title: 'Drink water every 2h',
    kind: 'notify',
    schedule_kind: 'cron',
    // Every 2 hours between 08:00 and 22:00.
    schedule_cron: '0 8-22/2 * * *',
  },
  {
    title: 'Log lunch',
    kind: 'notify',
    schedule_kind: 'daily',
    schedule_time: '13:30',
    notes: 'Open Calorie Lite and log what you just ate.',
  },
  {
    title: 'Weekly weigh-in',
    kind: 'notify',
    schedule_kind: 'weekly',
    schedule_time: '07:00',
    schedule_dow: [1], // Monday
  },
  {
    title: 'Weekly meal-plan review',
    kind: 'agent_loop',
    schedule_kind: 'weekly',
    schedule_time: '20:00',
    schedule_dow: [0], // Sunday
    agent_context: 'calorie-lite',
    agent_prompt:
      'Review my calorie and macro adherence this week using get_daily_summary + calorie_lite_entries_list. Call out days I hit / missed targets and give 3 concrete adjustments for next week. Keep the reply under 250 words.',
  },
  {
    title: 'Gym adherence check',
    kind: 'agent_loop',
    schedule_kind: 'weekly',
    schedule_time: '19:00',
    schedule_dow: [0], // Sunday
    agent_prompt:
      'Look at my get_gym_history for the last 7 days. Which routines did I skip vs plan? Suggest a light catch-up plan for the coming week so I stay on track. Reply concisely.',
  },
  {
    title: 'Grocery list from active meal plan',
    kind: 'agent_loop',
    schedule_kind: 'weekly',
    schedule_time: '10:00',
    schedule_dow: [6], // Saturday
    agent_context: 'calorie-lite',
    agent_prompt:
      'Read my active meal plan via get_meal_plan. Produce a grocery list grouped by store aisle (produce, protein, grains, dairy, pantry, oils) covering 7 days. Reply with just the list.',
  },
];
