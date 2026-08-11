import { defineMiniApp } from '@nothing/mini-apps-runtime';

/**
 * Journal — daily text-entry journal with an optional mood tag.
 *
 * Simplest possible model: one table (`journal_entries`), one row per
 * entry, no external deps. Users write a page for today, optionally tag
 * their mood on the 5-point scale, and the home hero shows this-week KPIs
 * (entries, streak, words, avg mood).
 *
 * Emoji tile icon per project memory (feedback_ns_tile_icons_use_emoji).
 * 📓 = notebook = journal.
 *
 * Subscription-gated at the tile + at the API layer for the two endpoints
 * (defence-in-depth: the Proxy already 302s unentitled users away from
 * `/app/*`).
 */
export default defineMiniApp({
  slug: 'journal',
  name: 'Journal',
  description: 'Daily text entries. Optional mood. Private by default.',
  icon: '📓',
  route: '/app/journal',
  requiresSubscription: true,
});
