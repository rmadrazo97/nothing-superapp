'use client';

/**
 * WeightView — calorie-lite sub-view for body-weight tracking.
 *
 * DB stores weight in kg. UI reads `preferences.weight_unit` and converts
 * kg <-> lb for display + input only — nothing converted ever hits the DB.
 *
 * Chart: inline SVG (no chart libs). Date on X, weight on Y. If
 * `weight_goal_kg` is set, we draw a dashed horizontal goal line in
 * cadmium red — the only accent-colored element in the chart, so the eye
 * lands on "am I above or below my target?" first.
 *
 * Trend chip: compares latest datapoint to the median of the datapoints
 * from 5–9 days ago (a "last week" window). Green when the delta moves
 * toward the goal, red when it moves away. When no goal is set we just
 * report the delta sign in neutral tone.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, usePreferences } from '@nothing/mini-apps-runtime';
import type { WeightEntry, WeightUnit } from '@nothing/shared';
import { useToast } from '../../../web/src/lib/toast/context';

const LB_PER_KG = 2.20462;

/** kg -> display value in the user's unit. Rounded to 1 decimal. */
function toDisplayWeight(kg: number, unit: WeightUnit): number {
  const v = unit === 'lb' ? kg * LB_PER_KG : kg;
  return Math.round(v * 10) / 10;
}

/** user input in their preferred unit -> kg for storage (1 decimal). */
function fromDisplayWeight(value: number, unit: WeightUnit): number {
  const kg = unit === 'lb' ? value / LB_PER_KG : value;
  return Math.round(kg * 10) / 10;
}

function unitLabel(unit: WeightUnit): string {
  return unit.toUpperCase();
}

/** e.g. "MAR 03" — Space Mono friendly. */
function toShortDate(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  return `${month} ${String(d.getDate()).padStart(2, '0')}`;
}

/** Median of a numeric list — used for the "last week" trend baseline. */
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function WeightView() {
  const preferences = usePreferences();
  const { toast } = useToast();
  const [entries, setEntries] = useState<WeightEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const weightUnit: WeightUnit = preferences.weight_unit ?? 'kg';
  const goalKg = preferences.weight_goal_kg;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/weight', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        if (res.status === 402) {
          setLoadError('Subscription required. Refresh to renew.');
          toast.info("This one's paid. Subscribe on the paywall.");
        } else if (res.status === 401) {
          setLoadError('Session expired. Sign in again.');
        } else if (res.status >= 500) {
          setLoadError('Could not load weight log.');
          toast.error("Something broke on our end. We're logging it.");
        } else {
          setLoadError('Could not load weight log.');
          toast.error('Could not load weight log.');
        }
        setEntries([]);
        return;
      }
      const body = (await res.json()) as { entries: WeightEntry[] };
      setEntries(body.entries);
    } catch {
      setLoadError('Network error.');
      toast.error("Can't reach the server. Check your connection.");
      setEntries([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Newest first from the API. Latest = index 0.
  const latest = entries?.[0];
  const now = Date.now();

  // "Last week" comparison window: entries logged 5–9 days ago. Median
  // smooths daily fluctuation without needing a full moving average.
  const lastWeekBaseline = useMemo(() => {
    if (!entries || entries.length === 0) return null;
    const min = now - 9 * 24 * 60 * 60 * 1000;
    const max = now - 5 * 24 * 60 * 60 * 1000;
    const window = entries
      .filter((e) => {
        const t = Date.parse(e.entered_at);
        return Number.isFinite(t) && t >= min && t <= max;
      })
      .map((e) => e.weight_kg);
    return median(window);
  }, [entries, now]);

  const deltaKg =
    latest != null && lastWeekBaseline != null ? latest.weight_kg - lastWeekBaseline : null;

  // Trend tone: green when heading toward goal, red when heading away.
  // No goal set → neutral (secondary text color).
  const trendTone: 'toward' | 'away' | 'neutral' = useMemo(() => {
    if (deltaKg == null || Math.abs(deltaKg) < 0.05) return 'neutral';
    if (goalKg == null || latest == null) return 'neutral';
    const wasAbove = latest.weight_kg - deltaKg > goalKg;
    const nowAbove = latest.weight_kg > goalKg;
    // Moving from above→below goal (or vice versa) counts as "toward".
    // Same side of goal but closer counts as "toward".
    const prevDist = Math.abs(latest.weight_kg - deltaKg - goalKg);
    const currDist = Math.abs(latest.weight_kg - goalKg);
    if (wasAbove !== nowAbove) return 'toward';
    return currDist < prevDist ? 'toward' : 'away';
  }, [deltaKg, goalKg, latest]);

  async function submitWeight(evt: React.FormEvent) {
    evt.preventDefault();
    if (saving) return;
    const n = Number(weightInput);
    if (!Number.isFinite(n) || n <= 0) {
      setFormError('Enter a valid weight.');
      return;
    }
    const kg = fromDisplayWeight(n, weightUnit);
    if (kg <= 20 || kg >= 400) {
      setFormError(`Weight must be between ${toDisplayWeight(20, weightUnit)} and ${toDisplayWeight(400, weightUnit)} ${unitLabel(weightUnit)}.`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/weight', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          weight_kg: kg,
          ...(noteInput.trim() ? { note: noteInput.trim() } : {}),
        }),
      });
      if (!res.ok) {
        if (res.status === 402) {
          setFormError('Subscription required.');
          toast.info("This one's paid. Subscribe on the paywall.");
        } else if (res.status >= 500) {
          setFormError('Could not save.');
          toast.error("Something broke on our end. We're logging it.");
        } else if (res.status === 400) {
          setFormError('Check the fields and try again.');
        } else {
          setFormError('Could not save.');
        }
        setSaving(false);
        return;
      }
      setWeightInput('');
      setNoteInput('');
      await load();
    } catch {
      setFormError('Network error.');
      toast.error("Can't reach the server. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    try {
      const res = await fetch(`/api/mini-apps/calorie-lite/weight?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        toast.error('Could not delete entry.');
        return;
      }
      await load();
    } catch {
      toast.error("Can't reach the server.");
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {loadError && (
        <div
          role="alert"
          className="caption"
          style={{
            color: 'var(--color-accent)',
            padding: 'var(--space-3) var(--space-4)',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          {loadError}
        </div>
      )}

      {entries === null ? (
        <p className="caption">Loading…</p>
      ) : (
        <>
          <LatestCard
            latest={latest ?? null}
            deltaKg={deltaKg}
            trendTone={trendTone}
            weightUnit={weightUnit}
            goalKg={goalKg ?? null}
          />

          {entries.length > 0 && (
            <WeightChart
              entries={entries}
              weightUnit={weightUnit}
              goalKg={goalKg ?? null}
            />
          )}

          {/* Log form */}
          <form
            onSubmit={submitWeight}
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--color-border-visible)',
              borderRadius: 'var(--radius-card)',
              padding: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            <span className="label">LOG WEIGHT</span>
            <label
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
            >
              <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
                WEIGHT ({unitLabel(weightUnit)})
              </span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder={weightUnit === 'lb' ? '165.4' : '75.0'}
                required
              />
            </label>
            <label
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
            >
              <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
                NOTE (OPTIONAL)
              </span>
              <input
                className="input"
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="e.g. morning · post-shower"
                autoComplete="off"
                maxLength={200}
              />
            </label>
            {formError && (
              <p role="alert" className="caption" style={{ color: 'var(--color-accent)' }}>
                {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={saving || weightInput.trim() === ''}
              style={{
                background:
                  saving || weightInput.trim() === ''
                    ? 'var(--color-surface-raised)'
                    : 'var(--color-accent)',
                color:
                  saving || weightInput.trim() === ''
                    ? 'var(--color-text-disabled)'
                    : 'var(--color-text-display)',
                border: 0,
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-3) var(--space-6)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor:
                  saving || weightInput.trim() === '' ? 'not-allowed' : 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>

          {entries.length === 0 ? (
            <EmptyState
              icon="◐"
              title="No weight logged"
              body="Log your first weigh-in above to start tracking your trend."
            />
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {entries.slice(0, 20).map((e) => (
                <li
                  key={e.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 'var(--space-4)',
                    padding: 'var(--space-3) 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
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
                        color: 'var(--color-text-disabled)',
                        fontSize: 'var(--text-caption)',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {toShortDate(e.entered_at)}
                    </span>
                    {e.note && (
                      <span
                        style={{
                          color: 'var(--color-text-secondary)',
                          fontSize: 'var(--text-caption)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {e.note}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                    <span
                      className="data"
                      style={{
                        color: 'var(--color-text-display)',
                        fontSize: 'var(--text-body)',
                        fontWeight: 700,
                      }}
                    >
                      {toDisplayWeight(e.weight_kg, weightUnit).toFixed(1)}{' '}
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        {unitLabel(weightUnit)}
                      </span>
                    </span>
                    <DeleteButton onClick={() => void deleteEntry(e.id)} label="Delete weight entry" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function LatestCard({
  latest,
  deltaKg,
  trendTone,
  weightUnit,
  goalKg,
}: {
  latest: WeightEntry | null;
  deltaKg: number | null;
  trendTone: 'toward' | 'away' | 'neutral';
  weightUnit: WeightUnit;
  goalKg: number | null;
}) {
  const trendColor =
    trendTone === 'toward'
      ? 'var(--color-success, var(--color-text-secondary))'
      : trendTone === 'away'
        ? 'var(--color-accent)'
        : 'var(--color-text-secondary)';

  const trendLabel = (() => {
    if (deltaKg == null) return 'NOT ENOUGH DATA';
    const displayDelta = Math.abs(toDisplayWeight(Math.abs(deltaKg), weightUnit));
    if (displayDelta < 0.05) return 'STEADY SINCE LAST WEEK';
    const arrow = deltaKg > 0 ? '▲' : '▼';
    return `${arrow} ${displayDelta.toFixed(1)} ${unitLabel(weightUnit)} SINCE LAST WEEK`;
  })();

  return (
    <section
      aria-label="Latest weight"
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
      <span className="label">LATEST · {unitLabel(weightUnit)}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
        <span className="display-xl">
          {latest ? toDisplayWeight(latest.weight_kg, weightUnit).toFixed(1) : '—'}
        </span>
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          {unitLabel(weightUnit)}
          {goalKg != null && (
            <>
              {' '}· GOAL {toDisplayWeight(goalKg, weightUnit).toFixed(1)}
            </>
          )}
        </span>
      </div>
      <span
        className="data"
        style={{
          color: trendColor,
          fontSize: 'var(--text-caption)',
          letterSpacing: '0.06em',
        }}
      >
        {trendLabel}
      </span>
    </section>
  );
}

// ─── Chart ──────────────────────────────────────────────────────────────────

/**
 * Inline SVG line chart. Datapoints are the entries in `entries` (newest
 * first from the API). We time-normalize the X axis so the spacing reflects
 * calendar gaps rather than sequence, and clamp the Y range to a
 * ±2-unit padding around the observed data so a flat trend still shows
 * some vertical detail.
 */
function WeightChart({
  entries,
  weightUnit,
  goalKg,
}: {
  entries: WeightEntry[];
  weightUnit: WeightUnit;
  goalKg: number | null;
}) {
  const WIDTH = 640;
  const HEIGHT = 180;
  const PAD_LEFT = 40;
  const PAD_RIGHT = 12;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 24;
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const sorted = useMemo(
    () =>
      [...entries]
        .map((e) => ({ t: Date.parse(e.entered_at), kg: e.weight_kg }))
        .filter((p) => Number.isFinite(p.t))
        .sort((a, b) => a.t - b.t),
    [entries],
  );

  if (sorted.length === 0) return null;

  const tMin = sorted[0].t;
  const tMax = sorted[sorted.length - 1].t;
  const tRange = Math.max(1, tMax - tMin);

  const values = sorted.map((p) => p.kg);
  if (goalKg != null) values.push(goalKg);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMax - yMin < 2) {
    // Give a nearly-flat series some breathing room so the line isn't
    // pinned to the top or bottom edge.
    const mid = (yMax + yMin) / 2;
    yMin = mid - 1;
    yMax = mid + 1;
  }
  const yRange = yMax - yMin;

  const x = (t: number) => PAD_LEFT + ((t - tMin) / tRange) * plotW;
  const y = (kg: number) => PAD_TOP + (1 - (kg - yMin) / yRange) * plotH;

  const path =
    sorted.length === 1
      ? // Single point: draw a short horizontal segment so there's something visible.
        `M ${PAD_LEFT} ${y(sorted[0].kg)} L ${PAD_LEFT + plotW} ${y(sorted[0].kg)}`
      : sorted
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(2)} ${y(p.kg).toFixed(2)}`)
          .join(' ');

  const goalY = goalKg != null ? y(goalKg) : null;

  // Y-axis labels: bottom, middle, top (in the user's unit).
  const yLabels = [yMin, (yMin + yMax) / 2, yMax].map((kg) => ({
    kg,
    display: toDisplayWeight(kg, weightUnit).toFixed(1),
    py: y(kg),
  }));

  return (
    <section
      aria-label="Weight trend"
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
      <span className="label">LAST 30 DAYS</span>
      <svg
        role="img"
        aria-label={`Weight trend, ${sorted.length} datapoints in ${unitLabel(weightUnit)}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {/* Y-axis label ticks + grid lines */}
        {yLabels.map((lbl, i) => (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              y1={lbl.py}
              x2={WIDTH - PAD_RIGHT}
              y2={lbl.py}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 6}
              y={lbl.py + 3}
              textAnchor="end"
              fontSize="10"
              fontFamily="var(--font-mono, monospace)"
              fill="var(--color-text-disabled)"
              style={{ letterSpacing: '0.04em' }}
            >
              {lbl.display}
            </text>
          </g>
        ))}

        {/* Goal line — dashed, cadmium red */}
        {goalY != null && (
          <line
            x1={PAD_LEFT}
            y1={goalY}
            x2={WIDTH - PAD_RIGHT}
            y2={goalY}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}

        {/* Data path */}
        <path
          d={path}
          fill="none"
          stroke="var(--color-text-display)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Datapoints */}
        {sorted.map((p, i) => (
          <circle
            key={i}
            cx={x(p.t)}
            cy={y(p.kg)}
            r={2.5}
            fill="var(--color-text-display)"
          />
        ))}

        {/* X-axis end labels */}
        <text
          x={PAD_LEFT}
          y={HEIGHT - 6}
          textAnchor="start"
          fontSize="10"
          fontFamily="var(--font-mono, monospace)"
          fill="var(--color-text-disabled)"
          style={{ letterSpacing: '0.04em' }}
        >
          {toShortDate(new Date(tMin).toISOString())}
        </text>
        <text
          x={WIDTH - PAD_RIGHT}
          y={HEIGHT - 6}
          textAnchor="end"
          fontSize="10"
          fontFamily="var(--font-mono, monospace)"
          fill="var(--color-text-disabled)"
          style={{ letterSpacing: '0.04em' }}
        >
          {toShortDate(new Date(tMax).toISOString())}
        </text>
      </svg>
    </section>
  );
}

function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-label={label}
      style={{
        background: 'transparent',
        border: 0,
        color: hover ? 'var(--color-accent)' : 'var(--color-text-disabled)',
        cursor: 'pointer',
        padding: 'var(--space-1) var(--space-2)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-label)',
        lineHeight: 1,
        transition: 'color var(--dur-fast) var(--ease-out)',
      }}
    >
      ×
    </button>
  );
}
