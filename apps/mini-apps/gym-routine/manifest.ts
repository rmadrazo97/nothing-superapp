import { defineMiniApp } from '@nothing/mini-apps-runtime';

/**
 * Gym — routine builder + live workout logger.
 *
 * A full mini-app: browse a 1,324-exercise catalog (reference data seeded in
 * migration 003, images/gifs served from raw.githubusercontent.com under
 * Gym Visual attribution), assemble named routines of sets × reps × weight,
 * and run a live workout session that logs each set as you complete it with
 * a between-sets rest timer.
 *
 * Paid tile — subscription-gated at the Proxy AND at every API endpoint
 * under /api/mini-apps/gym-routine/* (mirrors the calorie-lite pattern:
 * 402 on unentitled call as defence-in-depth).
 *
 * v0.5.1: launcher tile icons standardised on emoji (see project memo
 * feedback_ns_tile_icons_use_emoji). 🏋️ = weight lifter = gym.
 */
export default defineMiniApp({
  slug: 'gym-routine',
  name: 'Gym',
  description: 'Build routines. Log every set. Rest on the clock.',
  icon: '🏋️',
  route: '/app/gym-routine',
  requiresSubscription: true,
});
