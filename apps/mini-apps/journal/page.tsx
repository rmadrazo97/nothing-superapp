'use client';

/**
 * Journal — home / landing (v0.5.13).
 *
 * Layout:
 *   1. Compact header ("JOURNAL · MINI APP" kicker only).
 *   2. THIS WEEK PixelCard hero — 4 KPIs (ENTRIES / STREAK / WORDS / MOOD)
 *      inside a PixelMetricGrid, matching the Gym + Habits home design
 *      language.
 *   3. TODAY · <weekday date> — a big text-area + a row of mood chips + a
 *      SAVE / UPDATE button. Pre-fills the latest-today entry if one
 *      exists so tapping SAVE upserts today's page.
 *   4. RECENT ENTRIES — list of the last N entries with short-date + mood
 *      chip + preview text; tap opens a full-body BottomSheet.
 *
 * No client-side Supabase — everything flows through the auth+entitlement
 * gated Next route handlers under /api/mini-apps/journal/*.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { LoadErrorCard } from '@nothing/mini-apps-runtime';
import type { JournalEntry, JournalMood } from '@nothing/shared';
import { useToast } from '../../web/src/lib/toast/context';
import { PixelCard, PixelMetricGrid } from '../../web/src/components/pixel-ui';
import { BottomSheet } from '../../web/src/components/shell/BottomSheet';
import { SwipeableRow } from '../../web/src/components/shell/SwipeableRow';
import * as api from './lib/api.ts';
import {
  ApiError,
  MOOD_META,
  MOOD_ORDER,
  avgMoodEmoji,
  computeStreak,
  countWords,
  formatLocalDate,
  shortDateLabel,
  todayLocal,
  weekRange,
} from './lib/api.ts';

const CARD_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.5)',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--space-4)',
};

const TEXTAREA_STYLE: CSSProperties = {
  width: '100%',
  minHeight: 180,
  background: 'transparent',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-input)',
  padding: 'var(--space-3)',
  color: 'var(--color-text-display)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-body)',
  resize: 'vertical',
  lineHeight: 1.5,
};

const CHIP_ACTIVE: CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-button)',
  border: '1px solid var(--color-accent)',
  background: 'var(--color-accent)',
  color: 'var(--color-text-display)',
  minHeight: 32,
  cursor: 'pointer',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.06em',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const CHIP_INACTIVE: CSSProperties = {
  ...CHIP_ACTIVE,
  background: 'transparent',
  border: '1px solid var(--color-border-visible)',
  color: 'var(--color-text-secondary)',
};

const BODY_MAX = 20000;
// Show word count once the user has typed a "real" amount. Under ~400 chars
// the number just adds noise; past that it signals "you wrote a page."
const WORD_COUNT_MIN_CHARS = 400;
// Placeholder body used when the user only tags a mood (no note). Keeps the
// server schema happy (body min-length 1) without asking them to type.
const MOOD_ONLY_BODY = '(no note)';
const DRAFT_KEY_PREFIX = 'nsa.journal.draft.';
const draftKey = (iso: string) => `${DRAFT_KEY_PREFIX}${iso}`;

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  const weekday = dt.toLocaleString('en-US', { weekday: 'long' }).toUpperCase();
  const mon = dt.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  return `${weekday} ${mon} ${dt.getDate()}`;
}

function firstLine(body: string, limit = 80): string {
  const line = body.split('\n')[0] ?? body;
  return line.length > limit ? `${line.slice(0, limit).trimEnd()}…` : line;
}

export default function JournalHomePage() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<JournalMood | null>(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<JournalEntry | null>(null);
  // True when the composer was pre-filled from a localStorage draft (no
  // server entry yet for today). Shown as a small "DRAFT · restored" caption.
  const [draftRestored, setDraftRestored] = useState(false);
  const { toast } = useToast();

  const today = todayLocal();
  const week = useMemo(() => weekRange(), []);

  const load = useCallback(async () => {
    setError(null);
    try {
      // 90-day window: covers the current week hero, current streak walk,
      // and the RECENT ENTRIES list.
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 90);
      const list = await api.listEntries({
        from: formatLocalDate(from),
        to: formatLocalDate(to),
        limit: 100,
      });
      setEntries(list);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Network error.';
      setError(msg);
      toast.error('Could not load journal.');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Latest entry for today (if any) — the SAVE button becomes UPDATE and
  // the text-area pre-fills. List is server-ordered by (entered_on desc,
  // created_at desc) so the first `entered_on === today` row is the freshest.
  const todaysEntry = useMemo(() => {
    if (!entries) return null;
    return entries.find((e) => e.entered_on === today) ?? null;
  }, [entries, today]);

  // Prefill the composer whenever today's entry appears / changes underneath
  // us (initial load, after a save). Only prefill when the composer body is
  // empty OR still matches the entry we last saw — avoids clobbering an
  // in-progress edit from a background refetch.
  //
  // If no server entry exists for today, try to restore an autosaved draft
  // from localStorage (key: `nsa.journal.draft.<yyyy-mm-dd>`). Draft loses
  // to a server entry — as soon as the user saves today, the draft is cleared
  // and the composer switches to editing that entry.
  const [prefilledFromId, setPrefilledFromId] = useState<string | null>(null);
  useEffect(() => {
    if (entries === null) return; // wait for the first load
    if (!todaysEntry) {
      if (prefilledFromId != null) {
        // A previously-prefilled server entry was deleted — reset composer.
        setBody('');
        setMood(null);
        setPrefilledFromId(null);
        setDraftRestored(false);
        return;
      }
      // First-ever load with no server entry: try to hydrate from a draft.
      if (typeof window === 'undefined') return;
      try {
        const raw = window.localStorage.getItem(draftKey(today));
        if (raw) {
          const parsed = JSON.parse(raw) as {
            body?: string;
            mood?: JournalMood | null;
          };
          const draftBody = typeof parsed.body === 'string' ? parsed.body : '';
          const draftMood = parsed.mood ?? null;
          if (draftBody || draftMood) {
            setBody(draftBody);
            setMood(draftMood);
            setDraftRestored(true);
          }
        }
      } catch {
        // Corrupt draft — ignore, nothing to restore.
      }
      return;
    }
    if (todaysEntry.id !== prefilledFromId) {
      setBody(todaysEntry.body);
      setMood(todaysEntry.mood ?? null);
      setPrefilledFromId(todaysEntry.id);
      setDraftRestored(false);
    }
  }, [entries, todaysEntry, prefilledFromId, today]);

  // Autosave draft — only while there's no server entry for today. Once the
  // user saves, we clear the draft and switch to edit-mode against the row.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (todaysEntry) return; // saved entry takes over — no draft needed
    const key = draftKey(today);
    if (!body && !mood) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* storage full / disabled — no-op */
      }
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify({ body, mood }));
    } catch {
      /* quota / disabled — best-effort */
    }
  }, [body, mood, today, todaysEntry]);

  const entryDatesSet = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries ?? []) set.add(e.entered_on);
    return set;
  }, [entries]);

  const summary = useMemo(() => {
    if (!entries) return { entriesThisWeek: 0, streak: 0, words: 0, mood: '—' };
    const inWeek = entries.filter(
      (e) => e.entered_on >= week.from && e.entered_on <= week.to,
    );
    const entriesThisWeek = inWeek.length;
    const words = inWeek.reduce((sum, e) => sum + countWords(e.body), 0);
    const streak = computeStreak(entryDatesSet);
    const mood = avgMoodEmoji(inWeek);
    return { entriesThisWeek, streak, words, mood };
  }, [entries, entryDatesSet, week.from, week.to]);

  const submit = useCallback(async () => {
    const trimmed = body.trim();
    // Mood-only entries are allowed — some days people just want to tag
    // how they feel. We store a placeholder body so the server schema
    // (min-length 1) is satisfied without asking the user to type.
    if (!trimmed && !mood) return;
    const effectiveBody = trimmed || MOOD_ONLY_BODY;
    setSaving(true);
    try {
      if (todaysEntry) {
        await api.updateEntry(todaysEntry.id, { body: effectiveBody, mood: mood ?? null });
      } else {
        await api.createEntry({ body: effectiveBody, mood: mood ?? null });
      }
      // Draft is superseded by the saved row — clear it so we don't rehydrate
      // stale text if the entry is later deleted.
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(draftKey(today));
        } catch {
          /* no-op */
        }
      }
      setDraftRestored(false);
      await load();
      toast.success(todaysEntry ? "Today's entry updated." : 'Entry saved.');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Save failed.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [body, mood, todaysEntry, load, toast, today]);

  const removeEntry = useCallback(
    async (entry: JournalEntry) => {
      setEntries((prev) => (prev ? prev.filter((x) => x.id !== entry.id) : prev));
      try {
        await api.deleteEntry(entry.id);
        // If we deleted today's entry, clear the composer so the SAVE
        // button re-appears cleanly on the next render.
        if (entry.id === prefilledFromId) {
          setBody('');
          setMood(null);
          setPrefilledFromId(null);
        }
      } catch {
        toast.error('Delete failed — reverting.');
        await load();
      }
    },
    [load, prefilledFromId, toast],
  );

  const recent = useMemo(() => entries?.slice(0, 8) ?? [], [entries]);
  const trimmedBody = body.trim();
  // Save allowed when EITHER a note is written OR a mood is tagged.
  const canSave = (trimmedBody.length > 0 || mood !== null) && !saving;
  const wordCount = useMemo(() => countWords(body), [body]);
  const showWordCount = trimmedBody.length >= WORD_COUNT_MIN_CHARS;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        paddingTop: 'var(--space-6)',
        paddingBottom: 'var(--space-12)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          JOURNAL · MINI APP
        </span>
      </div>

      {error && (
        <LoadErrorCard
          section="JOURNAL"
          message={error}
          thingLabel="your entries"
          onReload={() => void load()}
        />
      )}

      {/* THIS WEEK hero */}
      <PixelCard title="THIS WEEK" meta={week.label}>
        <PixelMetricGrid
          kind="metric_grid"
          negativeDeltaTone="muted"
          items={[
            { label: 'ENTRIES', value: summary.entriesThisWeek },
            { label: 'STREAK', value: summary.streak, unit: 'd' },
            { label: 'WORDS', value: summary.words },
            { label: 'MOOD', value: summary.mood },
          ]}
        />
      </PixelCard>

      {/* TODAY composer */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
            TODAY · {weekdayLabel(today)}
          </span>
          <span
            className="data"
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-caption)',
            }}
          >
            {trimmedBody.length} / {BODY_MAX}
          </span>
        </div>

        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value.slice(0, BODY_MAX));
            // Once the user starts typing, drop the "restored" caption —
            // they're now editing, not looking at a restored draft.
            if (draftRestored) setDraftRestored(false);
          }}
          placeholder="What happened today?"
          style={TEXTAREA_STYLE}
          aria-label="Journal entry for today"
        />

        {(showWordCount || draftRestored) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginTop: 'calc(-1 * var(--space-2))',
            }}
          >
            <span
              className="caption"
              style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-caption)' }}
            >
              {draftRestored ? 'DRAFT · RESTORED' : ''}
            </span>
            {showWordCount && (
              <span
                className="data"
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--text-caption)',
                }}
              >
                {wordCount} {wordCount === 1 ? 'WORD' : 'WORDS'}
              </span>
            )}
          </div>
        )}

        <div>
          <span
            className="caption"
            style={{
              color: 'var(--color-text-secondary)',
              display: 'block',
              marginBottom: 'var(--space-2)',
            }}
          >
            MOOD (OPTIONAL)
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {MOOD_ORDER.map((m) => {
              const meta = MOOD_META[m];
              const active = mood === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMood(active ? null : m);
                    if (draftRestored) setDraftRestored(false);
                  }}
                  style={active ? CHIP_ACTIVE : CHIP_INACTIVE}
                  aria-pressed={active}
                >
                  <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
                    {meta.emoji}
                  </span>
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSave}
          style={{
            alignSelf: 'flex-start',
            background: canSave ? 'var(--color-accent)' : 'transparent',
            border: '1px solid var(--color-accent)',
            color: 'var(--color-text-display)',
            borderRadius: 'var(--radius-button)',
            padding: 'var(--space-3) var(--space-4)',
            minHeight: 44,
            cursor: canSave ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.06em',
            opacity: canSave ? 1 : 0.5,
          }}
        >
          {saving
            ? 'SAVING…'
            : todaysEntry
              ? 'UPDATE ENTRY'
              : 'SAVE ENTRY'}
        </button>
      </section>

      {/* RECENT ENTRIES */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          RECENT ENTRIES
        </span>

        {entries === null ? (
          <p className="caption">Loading…</p>
        ) : recent.length === 0 ? (
          <div style={{ ...CARD_STYLE }}>
            <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
              NO ENTRIES YET
            </span>
            <p style={{ margin: 'var(--space-2) 0 0 0', color: 'var(--color-text-secondary)' }}>
              Write a page about today. It stays private.
            </p>
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {recent.map((entry) => {
              const meta = entry.mood ? MOOD_META[entry.mood] : null;
              return (
                <li key={entry.id}>
                  <SwipeableRow
                    ariaLabel={`Journal entry for ${shortDateLabel(entry.entered_on)}`}
                    actions={[
                      {
                        label: 'Delete',
                        kind: 'destructive',
                        undoLabel: `Deleted ${shortDateLabel(entry.entered_on)} entry`,
                        onSelect: () => void removeEntry(entry),
                      },
                    ]}
                  >
                    <button
                      type="button"
                      onClick={() => setDetail(entry)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: '1px solid var(--color-border-visible)',
                        borderRadius: 'var(--radius-card)',
                        padding: 'var(--space-3) var(--space-4)',
                        color: 'inherit',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                      }}
                    >
                      <span
                        className="data"
                        style={{
                          color: 'var(--color-text-secondary)',
                          fontSize: 'var(--text-caption)',
                          minWidth: 56,
                          flexShrink: 0,
                        }}
                      >
                        {shortDateLabel(entry.entered_on)}
                      </span>
                      {meta && (
                        <span
                          aria-hidden
                          style={{ fontSize: 16, flexShrink: 0, lineHeight: 1 }}
                          title={meta.label}
                        >
                          {meta.emoji}
                        </span>
                      )}
                      <span
                        style={{
                          color: 'var(--color-text-display)',
                          fontSize: 'var(--text-body)',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {firstLine(entry.body)}
                      </span>
                    </button>
                  </SwipeableRow>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BottomSheet
        open={detail != null}
        onClose={() => setDetail(null)}
        ariaLabel="Journal entry detail"
      >
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
                {weekdayLabel(detail.entered_on)}
              </span>
              {detail.mood && (
                <div
                  style={{
                    marginTop: 'var(--space-2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                    {MOOD_META[detail.mood].emoji}
                  </span>
                  <span
                    className="caption"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {MOOD_META[detail.mood].label}
                  </span>
                </div>
              )}
            </div>
            <p
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                color: 'var(--color-text-display)',
                fontSize: 'var(--text-body)',
                lineHeight: 1.55,
              }}
            >
              {detail.body}
            </p>
          </div>
        )}
      </BottomSheet>

      <Link href="/app" style={{ textDecoration: 'none' }}>
        <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
          ← BACK TO LAUNCHER
        </span>
      </Link>
    </div>
  );
}
