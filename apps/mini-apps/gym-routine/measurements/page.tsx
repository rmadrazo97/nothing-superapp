'use client';

/**
 * MEASUREMENTS — weekly body composition log for the Gym mini-app.
 *
 * English translation of a Spanish weekly-measurement spreadsheet: six rows
 * (glutes / waist at navel / chest / thighs / biceps / weight), one column
 * per ISO week. Latest 4 weeks by default; SHOW ALL expands history.
 *
 * Storage vs display:
 *   - DB stores mm + g INTEGERS (see migration 021, packages/shared/src/
 *     schemas/gym.ts::bodyMetricSchema).
 *   - UI reads the user's gym settings (`weightUnit` + `lengthUnit`) via
 *     `useMiniAppSettings('gym-routine', ...)` and converts through the
 *     mmToIn / gToLbs / etc. helpers exported from `@nothing/shared`.
 *   - Flipping units in Settings re-renders this page — no reload needed.
 *
 * Data layer is the Mini-App Resource Framework — declared in
 * `apps/mini-apps/gym-routine/resources.ts`, backed by
 * `/api/mini-apps/gym-routine/resources/body-metrics`, read through the
 * `useResource<BodyMetric>('gym-routine', 'body-metrics')` hook.
 *
 * Interactions:
 *   - `+ NEW ENTRY` chip opens a BottomSheet form (six labeled number inputs +
 *     notes + week picker default to current ISO week). SAVE / CANCEL.
 *   - Each entry row wraps in <SwipeableRow> with EDIT + DELETE. Delete
 *     is destructive → UndoSnackbar via SwipeableRow's built-in wiring.
 *   - EDIT re-opens the same BottomSheet pre-filled with that row's values,
 *     converted into the user's current unit.
 */
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { LoadErrorCard, useResource } from '@nothing/mini-apps-runtime';
import {
  currentIsoWeek,
  gToKg,
  gToLbs,
  kgToG,
  lbsToG,
  mmToCm,
  mmToIn,
  cmToMm,
  inToMm,
  type BodyMetric,
} from '@nothing/shared';
import { BottomSheet } from '../../../web/src/components/shell/BottomSheet';
import { SwipeableRow } from '../../../web/src/components/shell/SwipeableRow';
import { useMiniAppSettings } from '../../../web/src/components/mini-app-settings';
import { useToast } from '../../../web/src/lib/toast/context';
import {
  GYM_SETTINGS_DEFAULTS,
  type GymSettings,
} from '../lib/settings.ts';
import {
  cardStyle,
  ghostButtonStyle,
  inputStyle,
  primaryButtonStyle,
} from '../lib/ui.ts';

// ─── metric-row config ──────────────────────────────────────────────────────
// Order locked per task spec (English translation of the source spreadsheet).
// `unit` = which unit family this metric belongs to (length vs mass).

type MetricKey =
  | 'glutes_mm'
  | 'waist_mm'
  | 'chest_mm'
  | 'thighs_mm'
  | 'biceps_mm'
  | 'weight_g';

interface MetricRowDef {
  key: MetricKey;
  label: string; // display name (uppercase-ready)
  unit: 'length' | 'mass';
}

const METRIC_ROWS: readonly MetricRowDef[] = [
  { key: 'glutes_mm', label: 'GLUTES', unit: 'length' },
  { key: 'waist_mm', label: 'WAIST (AT NAVEL)', unit: 'length' },
  { key: 'chest_mm', label: 'CHEST', unit: 'length' },
  { key: 'thighs_mm', label: 'THIGHS', unit: 'length' },
  { key: 'biceps_mm', label: 'BICEPS', unit: 'length' },
  { key: 'weight_g', label: 'WEIGHT', unit: 'mass' },
] as const;

const DEFAULT_VISIBLE_WEEKS = 4;

// ─── conversions ────────────────────────────────────────────────────────────

function toDisplay(
  value: number | null | undefined,
  metric: MetricRowDef,
  settings: GymSettings,
): number | null {
  if (value == null) return null;
  if (metric.unit === 'length') {
    return settings.lengthUnit === 'cm' ? mmToCm(value) : mmToIn(value);
  }
  return settings.weightUnit === 'kg' ? gToKg(value) : gToLbs(value);
}

function fromDisplay(
  value: number | null | undefined,
  metric: MetricRowDef,
  settings: GymSettings,
): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (metric.unit === 'length') {
    return settings.lengthUnit === 'cm' ? cmToMm(value) : inToMm(value);
  }
  return settings.weightUnit === 'kg' ? kgToG(value) : lbsToG(value);
}

function unitLabelFor(metric: MetricRowDef, settings: GymSettings): string {
  if (metric.unit === 'length') return settings.lengthUnit.toUpperCase();
  return settings.weightUnit.toUpperCase();
}

// ─── form state ─────────────────────────────────────────────────────────────

type FormValues = {
  iso_week: string;
  // All measurement fields kept as strings so an empty input stays empty
  // (not NaN, not 0). Parsed to number at submit time.
  glutes: string;
  waist: string;
  chest: string;
  thighs: string;
  biceps: string;
  weight: string;
  notes: string;
};

const EMPTY_FORM: FormValues = {
  iso_week: '',
  glutes: '',
  waist: '',
  chest: '',
  thighs: '',
  biceps: '',
  weight: '',
  notes: '',
};

function metricToField(key: MetricKey): keyof FormValues {
  switch (key) {
    case 'glutes_mm':
      return 'glutes';
    case 'waist_mm':
      return 'waist';
    case 'chest_mm':
      return 'chest';
    case 'thighs_mm':
      return 'thighs';
    case 'biceps_mm':
      return 'biceps';
    case 'weight_g':
      return 'weight';
  }
}

function entryToForm(entry: BodyMetric, settings: GymSettings): FormValues {
  const form: FormValues = { ...EMPTY_FORM, iso_week: entry.iso_week, notes: entry.notes ?? '' };
  for (const row of METRIC_ROWS) {
    const raw = entry[row.key] ?? null;
    const converted = toDisplay(raw, row, settings);
    (form as Record<keyof FormValues, string>)[metricToField(row.key)] =
      converted == null ? '' : String(converted);
  }
  return form;
}

function formToPayload(
  form: FormValues,
  settings: GymSettings,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { iso_week: form.iso_week };
  for (const row of METRIC_ROWS) {
    const field = metricToField(row.key);
    const raw = form[field].trim();
    if (raw.length === 0) {
      payload[row.key] = null;
      continue;
    }
    const num = Number(raw);
    payload[row.key] = fromDisplay(num, row, settings);
  }
  const notes = form.notes.trim();
  payload.notes = notes.length === 0 ? null : notes;
  return payload;
}

// ─── UI atoms local to this page ────────────────────────────────────────────

const compactChipStyle: CSSProperties = {
  ...primaryButtonStyle,
  // Match `+ ADD MEAL` sizing — compact, NOT the oversized pill A2 shrunk in
  // v0.5.1. See feedback_ns_space_scale_gap: no --space-5 / --space-7.
  padding: 'var(--space-2) var(--space-4)',
  minHeight: 36,
  fontSize: 'var(--text-label)',
};

// Header row shared by table cells so the token math is defined once.
const cellBase: CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  textAlign: 'left',
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-body-sm)',
  color: 'var(--color-text-primary)',
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap',
};

const cellHead: CSSProperties = {
  ...cellBase,
  color: 'var(--color-text-secondary)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 400,
};

// ─── main component ─────────────────────────────────────────────────────────

export default function MeasurementsPage() {
  const { settings, isLoading: settingsLoading } =
    useMiniAppSettings<GymSettings>('gym-routine', GYM_SETTINGS_DEFAULTS);

  const { data, isLoading, error, refetch, create, update, remove } =
    useResource<BodyMetric>('gym-routine', 'body-metrics', {
      params: { limit: 100 },
    });

  const { toast } = useToast();

  const [showAll, setShowAll] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // One canonical entry per ISO week — if the user has two rows in the same
  // week, the newer measured_at wins in the table. Copilot / API still store
  // both, but the table view collapses.
  const byWeek = useMemo(() => {
    const map = new Map<string, BodyMetric>();
    for (const entry of data) {
      const existing = map.get(entry.iso_week);
      if (!existing || entry.measured_at > existing.measured_at) {
        map.set(entry.iso_week, entry);
      }
    }
    return map;
  }, [data]);

  // Weeks descending (newest first) so column 1 = latest.
  const weekKeys = useMemo(() => {
    return Array.from(byWeek.keys()).sort().reverse();
  }, [byWeek]);

  const visibleWeeks = showAll
    ? weekKeys
    : weekKeys.slice(0, DEFAULT_VISIBLE_WEEKS);

  const openNew = useCallback(() => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, iso_week: currentIsoWeek() });
    setFormError(null);
    setSheetOpen(true);
  }, []);

  const openEdit = useCallback(
    (entry: BodyMetric) => {
      setEditingId(entry.id);
      setForm(entryToForm(entry, settings));
      setFormError(null);
      setSheetOpen(true);
    },
    [settings],
  );

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }, []);

  const onSave = useCallback(async () => {
    setFormError(null);
    setSaving(true);
    const payload = formToPayload(form, settings);
    // If every measurement + notes is empty, refuse — no point writing a
    // week key with nothing attached.
    const hasAny = METRIC_ROWS.some((r) => payload[r.key] != null) || payload.notes != null;
    if (!hasAny) {
      setSaving(false);
      setFormError('Enter at least one measurement.');
      return;
    }
    try {
      if (editingId) {
        await update(editingId, payload);
      } else {
        await create(payload);
      }
      await refetch();
      closeSheet();
      toast.success(editingId ? 'MEASUREMENTS UPDATED' : 'MEASUREMENTS SAVED');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'save_failed';
      setFormError(msg);
      toast.error('COULD NOT SAVE');
    } finally {
      setSaving(false);
    }
  }, [form, settings, editingId, update, create, refetch, closeSheet, toast]);

  const onDelete = useCallback(
    async (entry: BodyMetric) => {
      // Optimistic hide happens visually inside SwipeableRow (fade + strikethrough
      // during the undo window). We wait for commit → then talk to the API.
      try {
        await remove(entry.id);
        await refetch();
        toast.info('MEASUREMENTS DELETED');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'delete_failed';
        toast.error(`COULD NOT DELETE — ${msg}`);
        // Refetch anyway so the row reappears if the delete was rejected.
        await refetch();
      }
    },
    [remove, refetch, toast],
  );

  const isEmpty = !isLoading && data.length === 0;

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
      {/* Header ─── eyebrow + Doto title + compact NEW ENTRY chip. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="label">GYM · MEASUREMENTS</span>
          <h1 className="display-lg" style={{ margin: 0 }}>
            MEASUREMENTS
          </h1>
        </div>
        <button
          type="button"
          onClick={openNew}
          style={compactChipStyle}
          disabled={settingsLoading}
        >
          + NEW ENTRY
        </button>
      </div>

      {/* Back link — no nav shell for sub-routes yet, so a simple link out. */}
      <Link href="/app/gym-routine" style={{ textDecoration: 'none' }}>
        <span
          className="caption"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          ← BACK TO GYM
        </span>
      </Link>

      {error && (
        // v0.5.5 lesson 2: don't just render a red string — give the user
        // an explicit RELOAD so a transient 5xx isn't confused with "empty".
        <LoadErrorCard
          section="MEASUREMENTS"
          message={error}
          onReload={() => void refetch()}
        />
      )}

      {isLoading ? (
        <p className="caption">Loading…</p>
      ) : isEmpty && !error ? (
        <EmptyState onNew={openNew} />
      ) : !error ? (
        <section
          aria-label="Measurements table"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                minWidth: 320 + visibleWeeks.length * 96,
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...cellHead, position: 'sticky', left: 0, background: 'var(--color-surface)' }}>
                    METRIC
                  </th>
                  {visibleWeeks.map((wk) => (
                    <th key={wk} style={cellHead}>
                      {formatWeekHeader(wk)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td
                      style={{
                        ...cellBase,
                        color: 'var(--color-text-display)',
                        position: 'sticky',
                        left: 0,
                        background: 'var(--color-surface)',
                        fontFamily: 'var(--font-label)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {row.label}
                      <span
                        style={{
                          marginLeft: 'var(--space-2)',
                          color: 'var(--color-text-disabled)',
                          fontSize: 'var(--text-caption)',
                        }}
                      >
                        {unitLabelFor(row, settings)}
                      </span>
                    </td>
                    {visibleWeeks.map((wk) => {
                      const entry = byWeek.get(wk);
                      const raw = entry ? entry[row.key] : null;
                      const display = toDisplay(raw ?? null, row, settings);
                      return (
                        <td
                          key={`${row.key}-${wk}`}
                          style={{
                            ...cellBase,
                            fontFamily: 'var(--font-label)', fontVariantNumeric: 'tabular-nums',
                            color:
                              display == null
                                ? 'var(--color-text-disabled)'
                                : 'var(--color-text-display)',
                          }}
                        >
                          {display == null ? '—' : formatValue(display)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {weekKeys.length > DEFAULT_VISIBLE_WEEKS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              style={{ ...ghostButtonStyle, alignSelf: 'flex-start' }}
            >
              {showAll ? 'SHOW LATEST 4' : `SHOW ALL (${weekKeys.length})`}
            </button>
          )}

          {/* Per-entry cards below the table — each swipeable for EDIT / DELETE.
              The table is the read view; these cards are the edit surface so
              the user can act on individual weeks without hunting through
              column headers. */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
            aria-label="Entries list"
          >
            <span className="label">ENTRIES</span>
            {weekKeys.map((wk) => {
              const entry = byWeek.get(wk);
              if (!entry) return null;
              return (
                <SwipeableRow
                  key={entry.id}
                  ariaLabel={`Entry ${wk}`}
                  actions={[
                    {
                      label: 'EDIT',
                      kind: 'primary',
                      onSelect: () => openEdit(entry),
                    },
                    {
                      label: 'DELETE',
                      kind: 'destructive',
                      onSelect: () => void onDelete(entry),
                      undoLabel: 'MEASUREMENTS DELETED',
                    },
                  ]}
                >
                  <div
                    style={{
                      ...cardStyle,
                      padding: 'var(--space-3) var(--space-4)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 'var(--space-4)',
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--color-text-display)',
                        fontFamily: 'var(--font-label)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {formatWeekHeader(wk)}
                    </span>
                    <span
                      className="data"
                      style={{
                        color: 'var(--color-text-secondary)',
                        fontSize: 'var(--text-caption)',
                      }}
                    >
                      {summarizeEntry(entry, settings)}
                    </span>
                  </div>
                </SwipeableRow>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Bottom sheet — new entry OR edit an existing one. */}
      <BottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={editingId ? 'Edit measurements' : 'New entry'}
      >
        <EntryForm
          form={form}
          settings={settings}
          error={formError}
          saving={saving}
          onChange={setForm}
          onCancel={closeSheet}
          onSave={() => void onSave()}
        />
      </BottomSheet>
    </div>
  );
}

// ─── sub-components ─────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div
      style={{
        ...cardStyle,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        alignItems: 'flex-start',
        padding: 'var(--space-6)',
      }}
    >
      <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
        NO MEASUREMENTS YET
      </span>
      <p style={{ margin: 0, color: 'var(--color-text-primary)' }}>
        Log weekly weight + tape measurements to see trends over time.
      </p>
      <button type="button" onClick={onNew} style={primaryButtonStyle}>
        TAKE FIRST MEASUREMENT
      </button>
      <span
        className="caption"
        style={{ color: 'var(--color-text-disabled)' }}
      >
        Or ask Copilot: &ldquo;log my measurements&rdquo;
      </span>
    </div>
  );
}

interface EntryFormProps {
  form: FormValues;
  settings: GymSettings;
  error: string | null;
  saving: boolean;
  onChange: (next: FormValues) => void;
  onCancel: () => void;
  onSave: () => void;
}

function EntryForm({
  form,
  settings,
  error,
  saving,
  onChange,
  onCancel,
  onSave,
}: EntryFormProps) {
  const patch = (partial: Partial<FormValues>) => onChange({ ...form, ...partial });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Week selector — text input constrained to the ISO week shape. Default
          is the current week (set by the caller when opening the sheet). */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="label">WEEK</span>
        <input
          type="text"
          inputMode="text"
          value={form.iso_week}
          onChange={(e) => patch({ iso_week: e.target.value })}
          placeholder="2026-W32"
          style={inputStyle}
          aria-label="ISO week"
        />
        <span
          className="caption"
          style={{ color: 'var(--color-text-disabled)' }}
        >
          ISO 8601 week key. Default is the current week.
        </span>
      </label>

      {/* Six numeric inputs — one per metric, unit hint from settings. */}
      {METRIC_ROWS.map((row) => {
        const field = metricToField(row.key);
        const unit = unitLabelFor(row, settings);
        return (
          <label
            key={row.key}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
          >
            <span className="label">
              {row.label}{' '}
              <span style={{ color: 'var(--color-text-disabled)' }}>({unit})</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form[field]}
              onChange={(e) => patch({ [field]: e.target.value } as Partial<FormValues>)}
              placeholder={row.unit === 'mass' ? `e.g. 170.5 ${unit}` : `e.g. 32.0 ${unit}`}
              style={inputStyle}
              aria-label={`${row.label} in ${unit}`}
            />
          </label>
        );
      })}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="label">NOTES (optional)</span>
        <textarea
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          maxLength={1000}
          rows={3}
          placeholder="Post-workout, morning weigh-in, etc."
          style={{ ...inputStyle, resize: 'vertical', minHeight: 88 }}
        />
      </label>

      {error && (
        <div
          role="alert"
          className="caption"
          style={{ color: 'var(--color-accent)' }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          justifyContent: 'flex-end',
          paddingTop: 'var(--space-2)',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={ghostButtonStyle}
          disabled={saving}
        >
          CANCEL
        </button>
        <button
          type="button"
          onClick={onSave}
          style={primaryButtonStyle}
          disabled={saving}
        >
          {saving ? 'SAVING…' : 'SAVE'}
        </button>
      </div>
    </div>
  );
}

// ─── formatting helpers ────────────────────────────────────────────────────

/** "2026-W32" → "W32 · 2026". */
function formatWeekHeader(week: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return week;
  return `W${m[2]} · ${m[1]}`;
}

/** Small-int formatter — one decimal only when needed. */
function formatValue(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

/** Row summary: count of filled metrics + weight if present. */
function summarizeEntry(entry: BodyMetric, settings: GymSettings): string {
  const parts: string[] = [];
  const filled = METRIC_ROWS.filter((r) => entry[r.key] != null).length;
  parts.push(`${filled}/6 metrics`);
  if (entry.weight_g != null) {
    const w = toDisplay(entry.weight_g, METRIC_ROWS[5], settings);
    if (w != null) parts.push(`${formatValue(w)} ${settings.weightUnit.toUpperCase()}`);
  }
  return parts.join(' · ');
}
