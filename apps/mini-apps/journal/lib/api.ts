/**
 * Fetch helpers for the Journal mini-app.
 *
 * Same shape / conventions as the habits api.ts — every call goes through
 * the auth+entitlement-gated Next route handlers, never Supabase directly.
 * 402 short-circuits surface through `ApiError.status` so the page can
 * route to a paywall if needed.
 */
import type {
  JournalEntry,
  JournalEntryInsert,
  JournalEntryUpdate,
  JournalMood,
} from '@nothing/shared';

const ENTRIES_URL = '/api/mini-apps/journal/entries';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

// ─── entries CRUD ─────────────────────────────────────────────────────────

/** List caller's entries newest first (server default = last 90 days). */
export async function listEntries(params?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<JournalEntry[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.limit) qs.set('limit', String(params.limit));
  const url = qs.toString() ? `${ENTRIES_URL}?${qs.toString()}` : ENTRIES_URL;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const body = (await res.json()) as { entries: JournalEntry[] };
  return body.entries;
}

export async function createEntry(input: JournalEntryInsert): Promise<JournalEntry> {
  const res = await fetch(ENTRIES_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const body = (await res.json()) as { entry: JournalEntry };
  return body.entry;
}

export async function getEntry(id: string): Promise<JournalEntry> {
  const res = await fetch(`${ENTRIES_URL}/${id}`, { credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const body = (await res.json()) as { entry: JournalEntry };
  return body.entry;
}

export async function updateEntry(id: string, patch: JournalEntryUpdate): Promise<JournalEntry> {
  const res = await fetch(`${ENTRIES_URL}/${id}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  const body = (await res.json()) as { entry: JournalEntry };
  return body.entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const res = await fetch(`${ENTRIES_URL}/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new ApiError(res.status, await readError(res));
}

// ─── local-date helpers ───────────────────────────────────────────────────

export function todayLocal(): string {
  const d = new Date();
  return formatLocalDate(d);
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO week Monday–Sunday range containing `d`. Returns [monday, sunday]. */
export function weekRange(d: Date = new Date()): { from: string; to: string; label: string } {
  const day = d.getDay(); // 0..6, Sun..Sat
  // Monday-anchored week (Nothing OS convention).
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysSinceMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (x: Date) =>
    `${x.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${x.getDate()}`;
  return {
    from: formatLocalDate(monday),
    to: formatLocalDate(sunday),
    label: `${fmt(monday)} – ${fmt(sunday)}`,
  };
}

/**
 * Streak = consecutive prior days (including today if written) with an
 * entry. Missing days break the walk. Same "skip today if untouched" grace
 * rule as habits so an unwritten morning doesn't zero out a 30-day run.
 */
export function computeStreak(dates: Set<string>, from: Date = new Date()): number {
  let streak = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (!dates.has(formatLocalDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dates.has(formatLocalDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Count words in an entry body (whitespace-split). */
export function countWords(body: string): number {
  const trimmed = body.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Mood → emoji glyph (UI only; DB stores the token). */
export const MOOD_META: Record<JournalMood, { emoji: string; label: string; score: number }> = {
  great: { emoji: '😀', label: 'GREAT', score: 5 },
  good: { emoji: '🙂', label: 'GOOD', score: 4 },
  neutral: { emoji: '😐', label: 'NEUTRAL', score: 3 },
  low: { emoji: '😕', label: 'LOW', score: 2 },
  bad: { emoji: '😞', label: 'BAD', score: 1 },
};

export const MOOD_ORDER: JournalMood[] = ['great', 'good', 'neutral', 'low', 'bad'];

/** Average mood score → nearest emoji. Returns "—" when there are no
 *  tagged entries in the window. */
export function avgMoodEmoji(entries: readonly JournalEntry[]): string {
  const scored = entries
    .map((e) => (e.mood ? MOOD_META[e.mood].score : null))
    .filter((s): s is number => s != null);
  if (scored.length === 0) return '—';
  const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
  const rounded = Math.round(avg) as 1 | 2 | 3 | 4 | 5;
  const byScore: Record<number, JournalMood> = {
    5: 'great',
    4: 'good',
    3: 'neutral',
    2: 'low',
    1: 'bad',
  };
  const mood = byScore[rounded];
  return mood ? MOOD_META[mood].emoji : '—';
}

/** Short "Aug 12" style date label. */
export function shortDateLabel(iso: string): string {
  // iso = "YYYY-MM-DD" — build with local zero-time to avoid TZ drift.
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  const mon = dt.toLocaleString('en-US', { month: 'short' });
  return `${mon} ${dt.getDate()}`;
}
