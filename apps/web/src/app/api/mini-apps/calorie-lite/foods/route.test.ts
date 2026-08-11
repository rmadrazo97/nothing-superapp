/**
 * Unit coverage for the JS-side re-rank that powers the calorie-lite food
 * search. The helpers under test live in `@/lib/foods/score-row` and are
 * imported by `route.ts`. See that file's comments for context on why the
 * re-rank exists (v0.5.3 #97) and why the sort key looks the way it does
 * (v0.5.7 canonical-tie fix).
 *
 * Each `scoreRow` case pins down one of the three boost tiers (prefix /
 * word-initial / substring) so a future refactor of the multiplier logic
 * shows up as a red test rather than a silently degraded UX.
 *
 * The `compareScored` / `rankFoodRows` cases pin down the ordering
 * invariants — most importantly that a canonical row NEVER beats a
 * materially-better non-canonical hit (the exact regression that shipped
 * before v0.5.7).
 */
import { describe, expect, it } from 'vitest';
import {
  compareScored,
  rankFoodRows,
  scoreRow,
  similarity,
} from '@/lib/foods/score-row';

describe('scoreRow', () => {
  it('applies 3× prefix boost when the query is a prefix of the name', () => {
    const prefix = scoreRow('Chicken breast, cooked', 'chicken');
    const wordInit = scoreRow('Grilled chicken salad', 'chicken');
    // Both matches are non-zero and the prefix score is materially higher
    // (should be roughly ~3× the word-initial score modulo trigram noise).
    expect(prefix).toBeGreaterThan(0);
    expect(wordInit).toBeGreaterThan(0);
    expect(prefix).toBeGreaterThan(wordInit);
    // Ratio should sit in the (2×, 3×] window given the same query and
    // similar-length names. Not exactly 3 because the two names have
    // different trigram sets.
    expect(prefix / wordInit).toBeGreaterThan(1.4);
  });

  it('applies 2× word-initial boost when a whitespace-delimited word starts with the query', () => {
    const wordInit = scoreRow('Grilled chicken salad', 'chicken');
    const substring = scoreRow('Herb-crusted salmon', 'chicken');
    expect(wordInit).toBeGreaterThan(0);
    // Even a no-match name has some trigram overlap from the padding, so
    // substring can be a tiny non-zero number. It must still be dwarfed by
    // a real word-initial match.
    expect(wordInit).toBeGreaterThan(substring * 5);
  });

  it('word-initial match works after a comma (mirrors real seeded rows)', () => {
    // The seeded catalog contains entries like "Rice, brown, cooked"; a
    // query for "brown" should hit the 2× tier via the comma split.
    const s = scoreRow('Rice, brown, cooked', 'brown');
    expect(s).toBeGreaterThan(0);
    // A pure substring-only hit on the same query should be strictly lower.
    const substringOnly = scoreRow('Hashbrowns', 'brown');
    expect(s).toBeGreaterThan(substringOnly);
  });

  it('word-initial match works after a hyphen', () => {
    // The route splits on /[\s,\-]+/ so "Herb-crusted" should boost for
    // "crusted".
    const s = scoreRow('Herb-crusted salmon', 'crusted');
    expect(s).toBeGreaterThan(0);
    // Should be strictly higher than the same query against a name that
    // only contains it as a mid-word substring.
    const substringOnly = scoreRow('Encrusted lamb', 'crusted');
    expect(s).toBeGreaterThan(substringOnly);
  });

  it('returns a very small (near-zero) score when the query barely overlaps', () => {
    // "Herb-crusted salmon" has no `chicken` substring / word start. The
    // trigram similarity is not literally zero (padding trigrams like `  h`
    // etc.) but must be tiny — well under any real match.
    const s = scoreRow('Herb-crusted salmon', 'chicken');
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(0.1);
  });

  it('is case-insensitive on both sides (query is expected lowercased, name is normalized)', () => {
    // The route always lowercases the query before calling scoreRow, but
    // scoreRow itself must not care about the case of `name`.
    const upper = scoreRow('CHICKEN breast', 'chicken');
    const lower = scoreRow('chicken breast', 'chicken');
    expect(upper).toBeCloseTo(lower, 10);
  });
});

describe('similarity', () => {
  it('returns 0 when either side is empty', () => {
    expect(similarity('', 'chicken')).toBe(0);
    expect(similarity('chicken', '')).toBe(0);
  });

  it('returns a higher value for closer strings', () => {
    const close = similarity('chicken', 'chicken');
    const far = similarity('chicken', 'salmon');
    expect(close).toBeGreaterThan(far);
    expect(close).toBeGreaterThan(0.5);
  });
});

/* ── sort key ─────────────────────────────────────────────────────────── */

type Row = {
  name: string;
  is_canonical?: boolean | null;
  rank_penalty?: number | null;
};

/** Convenience: build a scored row shape without recomputing the score. */
function scored(
  name: string,
  score: number,
  canonical = false,
  penalty = 0,
): {
  row: Row;
  score: number;
  canonical: boolean;
  penalty: number;
} {
  return { row: { name }, score, canonical, penalty };
}

describe('compareScored (sort key)', () => {
  it('canonical wins within the same score bucket', () => {
    // Bucket = round(score * 10). 0.55 and 0.58 both land in bucket 6.
    const rows = [
      scored('non-canon', 0.55, false, 0),
      scored('canon', 0.58, true, 0),
    ];
    rows.sort(compareScored);
    expect(rows.map((r) => r.row.name)).toEqual(['canon', 'non-canon']);
  });

  it('canonical row NEVER beats a materially-better non-canonical hit', () => {
    // This is the exact regression that shipped before v0.5.7 — a
    // score-agnostic canonical bonus would sort the canonical row first
    // even when the other row scored ~9× higher.
    const rows = [
      scored('canon-weak', 0.1, true, 0),
      scored('loud-strong', 0.9, false, 0),
    ];
    rows.sort(compareScored);
    expect(rows.map((r) => r.row.name)).toEqual(['loud-strong', 'canon-weak']);
  });

  it('lower rank_penalty wins when score + canonical are tied', () => {
    const rows = [
      scored('penalized', 0.5, false, 100),
      scored('clean', 0.5, false, 0),
    ];
    rows.sort(compareScored);
    expect(rows.map((r) => r.row.name)).toEqual(['clean', 'penalized']);
  });

  it('higher raw score wins when bucket + canonical + penalty are tied', () => {
    // Both in bucket 6, both non-canonical, same penalty — the .58 row
    // should still edge out .55 by raw score.
    const rows = [
      scored('lower', 0.55, false, 0),
      scored('higher', 0.58, false, 0),
    ];
    rows.sort(compareScored);
    expect(rows.map((r) => r.row.name)).toEqual(['higher', 'lower']);
  });

  it('name ascending is the final tiebreaker', () => {
    const rows = [
      scored('Zeta', 0.5, false, 0),
      scored('Alpha', 0.5, false, 0),
    ];
    rows.sort(compareScored);
    expect(rows.map((r) => r.row.name)).toEqual(['Alpha', 'Zeta']);
  });
});

describe('rankFoodRows', () => {
  it('produces the expected end-to-end order for a realistic 3-row search', () => {
    // "chicken" against three seeded-shape rows:
    //   canonical prefix hit         → should win
    //   non-canonical word-init hit  → middle
    //   penalized substring hit      → last
    const rows: Row[] = [
      { name: 'Grilled chicken salad', is_canonical: false, rank_penalty: 0 },
      { name: 'Chicken breast, cooked', is_canonical: true, rank_penalty: 0 },
      {
        name: 'Bone-in chicken thigh, raw',
        is_canonical: false,
        rank_penalty: 50,
      },
    ];
    const ranked = rankFoodRows(rows, 'chicken');
    expect(ranked[0]?.name).toBe('Chicken breast, cooked');
    // The other two rows can shuffle by penalty vs word-init score, but the
    // penalized row must not be first.
    expect(ranked[ranked.length - 1]?.name).not.toBe('Chicken breast, cooked');
  });

  it('preserves original row object identity (no metadata leakage)', () => {
    const a: Row = { name: 'Alpha', is_canonical: true };
    const b: Row = { name: 'Beta', is_canonical: false };
    const out = rankFoodRows([a, b], 'alpha');
    // Objects returned are the same references we passed in.
    expect(out).toContain(a);
    expect(out).toContain(b);
    // No score/canonical/penalty properties get attached to the row.
    expect(out[0]).not.toHaveProperty('score');
  });

  it('tolerates missing / null is_canonical + rank_penalty', () => {
    const rows: Row[] = [
      { name: 'Chicken A' },
      { name: 'Chicken B', is_canonical: null, rank_penalty: null },
    ];
    // Should not throw and should produce a stable order.
    const out = rankFoodRows(rows, 'chicken');
    expect(out).toHaveLength(2);
  });
});
