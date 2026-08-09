'use client';

/**
 * TodayInsights — dark card at the top of the TODAY view showing 0-N small
 * observations about the caller's last 7 days.
 *
 * Server-driven: /api/mini-apps/calorie-lite/insights returns an array of
 * `{id, tone, title, body, metric?}`. We render nothing (component collapses)
 * when the array is empty and the user has data; a dashed "not enough data"
 * card appears only when the fetch returns zero AND the user is brand new.
 *
 * Re-fetches on `calorie_entry_added` so a new log can immediately promote
 * an "on-target" insight without a page reload.
 */
import { useCallback, useEffect, useState } from 'react';
import { useEvents } from '@nothing/mini-apps-runtime';
import { EVENT_KINDS } from '@nothing/shared';

export type InsightTone = 'good' | 'warn' | 'info';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  metric?: string;
}

/**
 * Tone markers:
 *   good → ▲ (up arrow, muted-good tint if the design system exposes one,
 *              otherwise the primary display colour so it doesn't shout red)
 *   warn → ▼ (down arrow, cadmium accent — same colour as CTAs, so warns
 *              read as "action needed")
 *   info → ◐ (half-circle, secondary text — neutral nudge)
 */
function toneMarker(tone: InsightTone): { glyph: string; color: string } {
  if (tone === 'good') {
    return {
      glyph: '▲',
      // Fall back to display colour when --color-success isn't defined.
      // The `color-mix()` guard avoids showing accent-red for a "good" cue.
      color: 'var(--color-success, var(--color-text-display))',
    };
  }
  if (tone === 'warn') {
    return { glyph: '▼', color: 'var(--color-accent)' };
  }
  return { glyph: '◐', color: 'var(--color-text-secondary)' };
}

export function TodayInsights() {
  const events = useEvents();
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/insights', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setLoadError(true);
        setInsights([]);
        return;
      }
      const body = (await res.json()) as { insights: Insight[] };
      setLoadError(false);
      setInsights(body.insights ?? []);
    } catch {
      setLoadError(true);
      setInsights([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = events.subscribe(EVENT_KINDS.calorie_entry_added, () => {
      void load();
    });
    return off;
  }, [events, load]);

  // First-load: reserve a small placeholder so the layout doesn't jump.
  if (insights === null) {
    return (
      <section
        aria-label="Insights"
        aria-busy="true"
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--color-border-visible)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-4)',
          minHeight: 60,
        }}
      >
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          INSIGHTS
        </span>
      </section>
    );
  }

  // Empty state: dashed border, single "keep logging" nudge. This is the
  // only surface where the card renders with zero insights — otherwise a
  // returning user with a stable-but-boring week just sees nothing.
  if (insights.length === 0) {
    return (
      <section
        aria-label="Insights"
        style={{
          background: 'transparent',
          border: '1px dashed var(--color-border-visible)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          INSIGHTS
        </span>
        <span
          className="caption"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {loadError
            ? '◐ COULD NOT LOAD INSIGHTS — try again in a moment.'
            : '◐ NOT ENOUGH DATA — keep logging for personalized nudges.'}
        </span>
      </section>
    );
  }

  return (
    <section
      aria-label="Insights"
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid var(--color-border-visible)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <span className="label">INSIGHTS</span>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        {insights.map((ins) => {
          const { glyph, color } = toneMarker(ins.tone);
          return (
            <li
              key={ins.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                alignItems: 'baseline',
                gap: 'var(--space-3)',
                paddingBottom: 'var(--space-3)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span
                aria-hidden
                style={{
                  color,
                  fontFamily: 'var(--font-label)',
                  fontSize: 'var(--text-label)',
                  lineHeight: 1,
                }}
              >
                {glyph}
              </span>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-1)',
                  minWidth: 0,
                }}
              >
                <span
                  className="data"
                  style={{
                    color: 'var(--color-text-display)',
                    fontSize: 'var(--text-caption)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {ins.title}
                </span>
                <span
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--text-body)',
                  }}
                >
                  {ins.body}
                </span>
              </div>
              {ins.metric && (
                <span
                  className="data"
                  style={{
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--text-caption)',
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                    padding: 'var(--space-1) var(--space-2)',
                    border: '1px solid var(--color-border-visible)',
                    borderRadius: 'var(--radius-button)',
                  }}
                >
                  {ins.metric}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
