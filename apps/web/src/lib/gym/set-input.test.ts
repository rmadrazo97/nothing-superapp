import { describe, expect, it } from 'vitest';
import type { SessionEntry } from '@nothing/shared';
import { sessionEntrySchema } from '@nothing/shared';
import {
  applyRepsEdit,
  applyWeightEdit,
  formatDraft,
  normalizeDraft,
  parseDraft,
  sanitizeEntries,
} from '../../../../mini-apps/gym-routine/lib/set-input';

const entry = (sets: Array<[number, number | null, boolean?]>): SessionEntry => ({
  exercise_id: 'x',
  name: 'Bench',
  sets: sets.map(([reps, weight_kg, done]) => ({
    reps,
    weight_kg,
    completed_at: done ? '2026-09-26T10:00:00.000Z' : null,
  })),
});

describe('normalizeDraft', () => {
  it('keeps a trailing decimal point mid-typing', () => {
    expect(normalizeDraft('22.', 'decimal')).toBe('22.');
  });
  it('accepts comma decimals', () => {
    expect(normalizeDraft('22,5', 'decimal')).toBe('22.5');
  });
  it('rejects letters and a second point', () => {
    expect(normalizeDraft('2a', 'decimal')).toBeNull();
    expect(normalizeDraft('2.5.', 'decimal')).toBeNull();
  });
  it('reps are integers only', () => {
    expect(normalizeDraft('12', 'int')).toBe('12');
    expect(normalizeDraft('12.5', 'int')).toBeNull();
    expect(normalizeDraft('', 'int')).toBe('');
  });
});

describe('parseDraft / formatDraft', () => {
  it('parses and clamps to server limits', () => {
    expect(parseDraft('', 'decimal')).toBeNull();
    expect(parseDraft('.', 'decimal')).toBeNull();
    expect(parseDraft('22.5', 'decimal')).toBe(22.5);
    expect(parseDraft('5000', 'decimal')).toBe(1000);
    expect(parseDraft('8', 'int')).toBe(8);
  });
  it('formats null as empty', () => {
    expect(formatDraft(null)).toBe('');
    expect(formatDraft(62.5)).toBe('62.5');
  });
});

describe('applyWeightEdit', () => {
  it('carries a new weight down to open empty sets', () => {
    const out = applyWeightEdit(entry([[8, null], [8, null], [8, null]]), 0, 60);
    expect(out.sets.map((s) => s.weight_kg)).toEqual([60, 60, 60]);
  });
  it('stays linked across per-keystroke edits, incl. clear + retype', () => {
    let e = entry([[8, null], [8, null]]);
    e = applyWeightEdit(e, 0, 2);
    e = applyWeightEdit(e, 0, 22);
    expect(e.sets.map((s) => s.weight_kg)).toEqual([22, 22]);
    e = applyWeightEdit(e, 0, null);
    e = applyWeightEdit(e, 0, 30);
    expect(e.sets.map((s) => s.weight_kg)).toEqual([30, 30]);
  });
  it('never touches completed, earlier, or diverged sets', () => {
    const out = applyWeightEdit(
      entry([[8, 50, true], [8, 60], [8, 60, true], [8, 70], [8, 60]]),
      1,
      65,
    );
    expect(out.sets.map((s) => s.weight_kg)).toEqual([50, 65, 60, 70, 65]);
  });
});

describe('applyRepsEdit', () => {
  it('only updates later open sets that matched', () => {
    const out = applyRepsEdit(entry([[8, 60], [8, 60], [6, 60], [8, 60, true]]), 0, 10);
    expect(out.sets.map((s) => s.reps)).toEqual([10, 10, 6, 8]);
  });
});

describe('sanitizeEntries', () => {
  it('always yields schema-valid entries', () => {
    const bad = entry([[12.5, 1200], [NaN, -3]]);
    const [out] = sanitizeEntries([bad]);
    expect(sessionEntrySchema.safeParse(out).success).toBe(true);
    expect(out.sets[0]).toMatchObject({ reps: 13, weight_kg: 1000 });
    expect(out.sets[1]).toMatchObject({ reps: 0, weight_kg: 0 });
  });
});
