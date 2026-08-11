import { defineMiniApp } from '@nothing/mini-apps-runtime';

/**
 * Habits — daily-checkbox habit tracker with per-habit streak count.
 *
 * Simplest possible model: one row per habit, one completion row per
 * (habit, date). Tap a habit → toggles today's completion; streak = walk
 * backward from today counting consecutive days done.
 *
 * Emoji tile icon per project memory (feedback_ns_tile_icons_use_emoji).
 * 🌱 = growth = habits (edges out ✅ which reads as "task done" rather
 * than "compounding practice").
 *
 * Subscription-gated at the tile + at the API layer for the two endpoints
 * (defence-in-depth: the Proxy already 302s unentitled users away from
 * `/app/*`).
 */
export default defineMiniApp({
  slug: 'habits',
  name: 'Habits',
  description: 'Daily checkboxes. One row, one habit, one streak.',
  icon: '🌱',
  route: '/app/habits',
  requiresSubscription: true,
});
