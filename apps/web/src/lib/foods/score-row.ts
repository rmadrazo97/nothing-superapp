/**
 * Post-fetch ranking helpers for the calorie-lite food search.
 *
 * Extracted from `apps/web/src/app/api/mini-apps/calorie-lite/foods/route.ts`
 * so the ranking logic is unit-testable without pulling in the whole Next.js
 * route module (which drags in Supabase + entitlement code).
 *
 * See the route file for the full context of the JS-side re-rank. The rules
 * here mirror the ORDER BY described in migration 023:
 *   (similarity * boost) DESC, is_canonical DESC, rank_penalty ASC,
 *   score DESC, name ASC
 * with the (similarity * boost) bucketed to 1 decimal so canonical rows win
 * ergonomic ties without ever beating a materially-better non-canonical hit.
 */

/**
 * Cheap trigram-like similarity between the query and a food name. Not a
 * true pg_trgm — a fast Jaccard-on-3grams approximation that's stable + fast
 * enough for a 200-row post-fetch sort.
 */
export function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) {
    out.add(padded.slice(i, i + 3));
  }
  return out;
}

export function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  for (const g of tb) if (ta.has(g)) intersect += 1;
  const union = ta.size + tb.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/**
 * Score a food row against a lowercased query string.
 *   3× — query is a prefix of the (lowercased) name.
 *   2× — any whitespace/comma/hyphen-delimited word in the name starts with
 *        the query.
 *   1× — plain substring / trigram match (base weight).
 * Multiplied by trigram similarity so tighter matches always outscore loose
 * ones within a boost bucket.
 */
export function scoreRow(name: string, qLower: string): number {
  const nameLower = name.toLowerCase();
  let boost = 1;
  if (nameLower.startsWith(qLower)) {
    boost = 3;
  } else {
    // Word-initial match: split on spaces/commas/hyphens.
    const words = nameLower.split(/[\s,\-]+/);
    if (words.some((w) => w.startsWith(qLower))) boost = 2;
  }
  const sim = similarity(nameLower, qLower);
  return sim * boost;
}

export interface ScoredRow<T extends { name: string | null | undefined }> {
  row: T;
  score: number;
  canonical: boolean;
  penalty: number;
}

/**
 * Comparator implementing the (score_bucket desc, is_canonical desc,
 * penalty asc, score desc, name asc) ordering. Exported so the sort key
 * can be unit-tested in isolation from the fetch/paginate flow.
 */
export function compareScored<T extends { name: string | null | undefined }>(
  a: ScoredRow<T>,
  b: ScoredRow<T>,
): number {
  // Bucket scores at 1 decimal so near-ties (e.g. 0.62 vs 0.58) let
  // is_canonical break the tie instead of nose-diving because of
  // fractional similarity noise. This makes canonical rows win
  // ergonomically-tied matches without ever beating a materially
  // better non-canonical hit.
  const aBucket = Math.round(a.score * 10);
  const bBucket = Math.round(b.score * 10);
  if (bBucket !== aBucket) return bBucket - aBucket;
  if (a.canonical !== b.canonical) return a.canonical ? -1 : 1;
  if (a.penalty !== b.penalty) return a.penalty - b.penalty;
  if (b.score !== a.score) return b.score - a.score;
  return String(a.row.name).localeCompare(String(b.row.name));
}

/**
 * Rank a set of food rows against a lowercased query. Returns rows in
 * descending priority order. Rows keep their original object identity — the
 * scoring metadata is not attached.
 */
export function rankFoodRows<
  T extends {
    name: string | null | undefined;
    is_canonical?: boolean | null;
    rank_penalty?: number | null;
  },
>(rows: readonly T[], qLower: string): T[] {
  return rows
    .map<ScoredRow<T>>((r) => ({
      row: r,
      score: scoreRow(String(r.name ?? ''), qLower),
      canonical: r.is_canonical === true,
      penalty: Number(r.rank_penalty ?? 0),
    }))
    .sort(compareScored)
    .map((s) => s.row);
}
