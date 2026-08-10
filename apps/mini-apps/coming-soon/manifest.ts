import { defineMiniApp } from '@nothing/mini-apps-runtime';

/**
 * Placeholder mini-app — proves the registry loader works end-to-end today
 * without a real product surface. Task 12 lands `calorie-lite` alongside
 * this; once we have two real mini-apps we can decide whether to keep this
 * "coming soon" tile as a permanent teaser or retire it.
 *
 * `requiresSubscription: false` deliberately — this tile must render to
 * unentitled users too so the launcher never appears empty for a fresh
 * install.
 */
export default defineMiniApp({
  slug: 'coming-soon',
  name: 'More soon',
  description: 'Additional mini-apps land here as they ship.',
  // v0.5.1: launcher tile icons standardised on emoji. ✨ = sparkle =
  // "something new is coming". Also matches the dashed-outline REQUEST APP
  // link below the grid.
  icon: '✨',
  route: '/app/coming-soon',
  requiresSubscription: false,
});
