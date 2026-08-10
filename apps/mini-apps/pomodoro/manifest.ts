import { defineMiniApp } from '@nothing/mini-apps-runtime';

/**
 * Pomodoro — focus timer mini-app.
 *
 * Classic 25/5/15 cycle: 25 min work, 5 min short break, and every 4th
 * round a 15 min long break. Durations + cycle length are all
 * user-tunable in the in-app settings drawer.
 *
 * The tile is behind the paywall — subscription-gated at the Proxy AND
 * at the API layer for the completed-session log endpoint.
 */
export default defineMiniApp({
  slug: 'pomodoro',
  name: 'Pomodoro',
  description: 'Focus in cycles. Log the sessions you finish.',
  // v0.5.1: launcher tile icons standardised on emoji (see project memo
  // feedback_ns_tile_icons_use_emoji). 🍅 = tomato = pomodoro.
  icon: '🍅',
  route: '/app/pomodoro',
  requiresSubscription: true,
});
