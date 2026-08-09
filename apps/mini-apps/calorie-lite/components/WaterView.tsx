'use client';

/**
 * WaterView — calorie-lite sub-view for water intake tracking.
 *
 * DB stores volumes in mL. UI reads `preferences.volume_unit` and converts
 * ml <-> oz for display + input only — nothing converted ever lands in the
 * DB. Design constraints:
 *   - Dark card: rgba(0,0,0,0.5) bg, --color-border-visible outline,
 *     --radius-card, --space-4 padding.
 *   - Doto (.display-xl) for the current-vs-goal number.
 *   - Space Mono (.data) for unit + timestamps.
 *   - Cadmium red (--color-accent) for the progress bar fill + primary CTAs
 *     only — never body text.
 *   - No hex codes anywhere; tokens only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, usePreferences } from '@nothing/mini-apps-runtime';
import type { WaterEntry, VolumeUnit } from '@nothing/shared';
import { useToast } from '../../../web/src/lib/toast/context';

const ML_PER_OZ = 29.5735;
const QUICK_ADD_ML = [250, 500, 750] as const;

/** ml -> display value in the user's unit, rounded to 1 decimal for oz / 0 for ml. */
function toDisplayVolume(ml: number, unit: VolumeUnit): number {
  if (unit === 'oz') return Math.round((ml / ML_PER_OZ) * 10) / 10;
  return Math.round(ml);
}

/** user's input (in their preferred unit) -> ml integer for storage. */
function fromDisplayVolume(value: number, unit: VolumeUnit): number {
  if (unit === 'oz') return Math.round(value * ML_PER_OZ);
  return Math.round(value);
}

function unitLabel(unit: VolumeUnit): string {
  return unit.toUpperCase();
}

/** HH:MM local — matches the calorie EntryList time convention. */
function toLocalTime(iso: string): string {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 5);
}

/** YYYY-MM-DD local date key from an ISO timestamp. */
function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Shift a local YYYY-MM-DD key by `deltaDays`. */
function shiftDateKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toWeekdayShort(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase().slice(0, 3);
}

export function WaterView() {
  const preferences = usePreferences();
  const { toast } = useToast();
  const [entries, setEntries] = useState<WaterEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [saving, setSaving] = useState(false);

  const volumeUnit: VolumeUnit = preferences.volume_unit ?? 'ml';
  const goalMl = preferences.water_goal_ml ?? 2500;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/water', {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        if (res.status === 402) {
          setLoadError('Subscription required. Refresh to renew.');
          toast.info("This one's paid. Subscribe on the paywall.");
        } else if (res.status === 401) {
          setLoadError('Session expired. Sign in again.');
        } else if (res.status >= 500) {
          setLoadError('Could not load water log.');
          toast.error("Something broke on our end. We're logging it.");
        } else {
          setLoadError('Could not load water log.');
          toast.error('Could not load water log.');
        }
        setEntries([]);
        return;
      }
      const body = (await res.json()) as { entries: WaterEntry[] };
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

  const todayKey = useMemo(() => toLocalDateKey(new Date().toISOString()), []);

  const todayEntries = useMemo(
    () => (entries ?? []).filter((e) => toLocalDateKey(e.entered_at) === todayKey),
    [entries, todayKey],
  );

  const todayTotalMl = useMemo(
    () => todayEntries.reduce((sum, e) => sum + e.ml, 0),
    [todayEntries],
  );

  const progress = Math.min(1, goalMl > 0 ? todayTotalMl / goalMl : 0);
  const displayCurrent = toDisplayVolume(todayTotalMl, volumeUnit);
  const displayGoal = toDisplayVolume(goalMl, volumeUnit);

  // 7-day trend buckets (oldest -> newest, matches the calorie sparkline).
  const weeklyBuckets = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of entries ?? []) {
      const key = toLocalDateKey(e.entered_at);
      map[key] = (map[key] ?? 0) + e.ml;
    }
    const out: { key: string; ml: number; weekday: string; active: boolean }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const key = shiftDateKey(todayKey, -i);
      const ml = map[key] ?? 0;
      out.push({ key, ml, weekday: toWeekdayShort(key), active: ml > 0 });
    }
    return out;
  }, [entries, todayKey]);

  const maxWeeklyMl = Math.max(goalMl, ...weeklyBuckets.map((b) => b.ml), 1);

  async function addMl(ml: number) {
    if (saving || ml <= 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/mini-apps/calorie-lite/water', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ml }),
      });
      if (!res.ok) {
        if (res.status === 402) {
          toast.info("This one's paid. Subscribe on the paywall.");
        } else if (res.status >= 500) {
          toast.error("Something broke on our end. We're logging it.");
        } else if (res.status === 400) {
          toast.error('Amount out of range (1–4999 mL).');
        } else {
          toast.error('Could not save water.');
        }
        setSaving(false);
        return;
      }
      await load();
      setCustomOpen(false);
      setCustomValue('');
    } catch {
      toast.error("Can't reach the server. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    try {
      const res = await fetch(`/api/mini-apps/calorie-lite/water?id=${encodeURIComponent(id)}`, {
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

  function submitCustom(evt: React.FormEvent) {
    evt.preventDefault();
    const n = Number(customValue);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a positive amount.');
      return;
    }
    const ml = fromDisplayVolume(n, volumeUnit);
    if (ml < 1 || ml > 4999) {
      toast.error(`Amount must be 1–4999 mL (${volumeUnit === 'oz' ? '~0.03–169 OZ' : '1–4999 ML'}).`);
      return;
    }
    void addMl(ml);
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

      {/* Total card */}
      <section
        aria-label="Today's water intake"
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
        <span className="label">TODAY · {unitLabel(volumeUnit)}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
          <span className="display-xl">{displayCurrent.toLocaleString()}</span>
          <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
            / {displayGoal.toLocaleString()} {unitLabel(volumeUnit)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress toward daily water goal"
          style={{
            position: 'relative',
            height: 4,
            background: 'var(--color-border)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: `${Math.round(progress * 100)}%`,
              background: 'var(--color-accent)',
              transition: 'width var(--dur-medium) var(--ease-out)',
            }}
          />
        </div>
        <span
          className="data"
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-caption)',
          }}
        >
          {Math.round(progress * 100)}% OF GOAL
        </span>
      </section>

      {/* Quick add row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
        }}
      >
        {QUICK_ADD_ML.map((ml) => {
          const label = toDisplayVolume(ml, volumeUnit);
          return (
            <button
              key={ml}
              type="button"
              onClick={() => void addMl(ml)}
              disabled={saving}
              style={{
                background: 'var(--color-accent)',
                color: 'var(--color-text-display)',
                border: 0,
                borderRadius: 'var(--radius-button)',
                padding: 'var(--space-3) var(--space-4)',
                fontFamily: 'var(--font-label)',
                fontSize: 'var(--text-label)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: saving ? 'not-allowed' : 'pointer',
                flex: '1 1 auto',
                minWidth: 88,
              }}
            >
              + {label} {unitLabel(volumeUnit)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          disabled={saving}
          style={{
            background: 'transparent',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-button)',
            padding: 'var(--space-3) var(--space-4)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: saving ? 'not-allowed' : 'pointer',
            flex: '1 1 auto',
            minWidth: 88,
          }}
        >
          + Custom
        </button>
      </div>

      {customOpen && (
        <form
          onSubmit={submitCustom}
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid var(--color-border-visible)',
            borderRadius: 'var(--radius-card)',
            padding: 'var(--space-4)',
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'flex-end',
          }}
        >
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              flex: 1,
            }}
          >
            <span className="caption" style={{ color: 'var(--color-text-secondary)' }}>
              CUSTOM AMOUNT ({unitLabel(volumeUnit)})
            </span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              step={volumeUnit === 'oz' ? 0.1 : 1}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder={volumeUnit === 'oz' ? '8.5' : '250'}
              autoFocus
            />
          </label>
          <button
            type="submit"
            disabled={saving || customValue.trim() === ''}
            style={{
              background:
                saving || customValue.trim() === ''
                  ? 'var(--color-surface-raised)'
                  : 'var(--color-accent)',
              color:
                saving || customValue.trim() === ''
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
                saving || customValue.trim() === '' ? 'not-allowed' : 'pointer',
            }}
          >
            Save
          </button>
        </form>
      )}

      {/* Today's entries */}
      {entries === null ? (
        <p className="caption">Loading…</p>
      ) : todayEntries.length === 0 ? (
        <EmptyState
          icon="◐"
          title="No water logged today"
          body="Tap a quick-add above to start tracking hydration."
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
          {[...todayEntries]
            .sort((a, b) => b.entered_at.localeCompare(a.entered_at))
            .map((e) => (
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
                <span
                  className="data"
                  style={{
                    color: 'var(--color-text-disabled)',
                    fontSize: 'var(--text-caption)',
                    letterSpacing: '0.06em',
                  }}
                >
                  {toLocalTime(e.entered_at)}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                  <span
                    className="data"
                    style={{
                      color: 'var(--color-text-display)',
                      fontSize: 'var(--text-body)',
                      fontWeight: 700,
                    }}
                  >
                    {toDisplayVolume(e.ml, volumeUnit).toLocaleString()}{' '}
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {unitLabel(volumeUnit)}
                    </span>
                  </span>
                  <DeleteButton onClick={() => void deleteEntry(e.id)} label="Delete water entry" />
                </div>
              </li>
            ))}
        </ul>
      )}

      {/* Weekly trend */}
      {(entries?.length ?? 0) > 0 && (
        <section
          aria-label="Last 7 days water intake"
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
          <span className="label">LAST 7 DAYS</span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 'var(--space-2)',
              alignItems: 'end',
              height: 80,
            }}
          >
            {weeklyBuckets.map((b) => {
              const pct = Math.max(0.04, b.ml / maxWeeklyMl);
              const goalPct = b.ml >= goalMl;
              return (
                <div
                  key={b.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 'var(--space-1)',
                    height: '100%',
                    justifyContent: 'flex-end',
                  }}
                  aria-label={`${b.weekday}: ${toDisplayVolume(b.ml, volumeUnit)} ${unitLabel(volumeUnit)}`}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.round(pct * 100)}%`,
                      background: goalPct
                        ? 'var(--color-accent)'
                        : b.active
                          ? 'var(--color-text-secondary)'
                          : 'var(--color-border)',
                      borderRadius: 2,
                      transition: 'height var(--dur-medium) var(--ease-out)',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 'var(--space-2)',
            }}
          >
            {weeklyBuckets.map((b) => (
              <span
                key={`${b.key}-label`}
                className="data"
                style={{
                  color: 'var(--color-text-disabled)',
                  fontSize: 'var(--text-caption)',
                  textAlign: 'center',
                  letterSpacing: '0.04em',
                }}
              >
                {b.weekday}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
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
