import { defineMiniApp } from '@nothing/mini-apps-runtime';

/**
 * Reminders — the mini-app that ships two-in-one:
 *   1. Plain push reminders (drink water, weigh in, log lunch).
 *   2. AGENT LOOPS — a reminder that runs an autonomous copilot prompt
 *      on the same cadence and pushes the result. Weekly meal-plan review,
 *      gym-adherence check, grocery list from the active plan. Set once,
 *      get a push when the agent's done.
 *
 * Subscription-gated at the tile + at the tick handler — the agent loop
 * costs tokens on our nickel, so it lives behind the paywall.
 */
export default defineMiniApp({
  slug: 'reminders',
  name: 'Reminders',
  description: 'Reminders and agent loops.',
  // ⏰ renders reliably on iOS Safari 17+ (verified). Nothing-OS-adjacent.
  icon: '⏰',
  route: '/app/reminders',
  requiresSubscription: true,
  settings: {
    title: 'Reminders',
  },
});
