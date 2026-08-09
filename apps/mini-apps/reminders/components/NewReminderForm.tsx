'use client';

/**
 * NewReminderForm — the inline "+ New reminder" form.
 * Supports: title, notes, kind (notify | agent_loop), schedule shape
 * (once | daily | weekly | monthly | cron), timezone (defaults to
 * browser tz), and the agent-loop payload (prompt + optional model +
 * max steps).
 *
 * Templates disclosure ships 6 canned reminders — 3 notify, 3 agent
 * loops — that pre-fill the form so the "wow, this is actually
 * powerful" moment lands in one tap.
 */
import { useMemo, useState } from 'react';
import type { ReminderInsert, ReminderKind, ScheduleKind } from '@nothing/shared';
import { TEMPLATES, type Template } from '../lib/templates.ts';

const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

interface FormState {
  title: string;
  notes: string;
  kind: ReminderKind;
  schedule_kind: ScheduleKind;
  schedule_at: string;
  schedule_time: string;
  schedule_dow: number[];
  schedule_dom: number;
  schedule_cron: string;
  timezone: string;
  agent_prompt: string;
  agent_context: string;
  agent_max_steps: number;
}

export default function NewReminderForm({ onSubmit, onCancel }: Props) {
  const browserTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const [state, setState] = useState<FormState>({
    title: '',
    notes: '',
    kind: 'notify',
    schedule_kind: 'daily',
    schedule_at: '',
    schedule_time: '09:00',
    schedule_dow: [1],
    schedule_dom: 1,
    schedule_cron: '',
    timezone: browserTz,
    agent_prompt: '',
    agent_context: '',
    agent_max_steps: 5,
  });
  const [showTemplates, setShowTemplates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const applyTemplate = (t: Template) => {
    setState((prev) => ({
      ...prev,
      title: t.title,
      notes: t.notes ?? '',
      kind: t.kind,
      schedule_kind: t.schedule_kind,
      schedule_at: t.schedule_at ?? '',
      schedule_time: t.schedule_time ?? prev.schedule_time,
      schedule_dow: t.schedule_dow ?? prev.schedule_dow,
      schedule_dom: t.schedule_dom ?? prev.schedule_dom,
      schedule_cron: t.schedule_cron ?? '',
      agent_prompt: t.agent_prompt ?? '',
      agent_context: t.agent_context ?? '',
    }));
    setShowTemplates(false);
  };

  const toggleDow = (d: number) => {
    setState((prev) => {
      const set = new Set(prev.schedule_dow);
      if (set.has(d)) set.delete(d);
      else set.add(d);
      return { ...prev, schedule_dow: Array.from(set).sort() };
    });
  };

  const buildPayload = (): ReminderInsert => {
    const base: ReminderInsert = {
      title: state.title.trim(),
      notes: state.notes.trim() || null,
      kind: state.kind,
      schedule_kind: state.schedule_kind,
      timezone: state.timezone,
      active: true,
    };
    switch (state.schedule_kind) {
      case 'once':
        base.schedule_at = state.schedule_at
          ? new Date(state.schedule_at).toISOString()
          : null;
        break;
      case 'daily':
        base.schedule_time = state.schedule_time;
        break;
      case 'weekly':
        base.schedule_time = state.schedule_time;
        base.schedule_dow = state.schedule_dow;
        break;
      case 'monthly':
        base.schedule_dom = state.schedule_dom;
        base.schedule_time = state.schedule_time;
        break;
      case 'cron':
        base.schedule_cron = state.schedule_cron.trim();
        break;
    }
    if (state.kind === 'agent_loop') {
      base.agent_task = {
        prompt: state.agent_prompt.trim(),
        context: state.agent_context.trim() || undefined,
        max_steps: state.agent_max_steps,
      };
    }
    return base;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!state.title.trim()) {
      setErr('Title is required.');
      return;
    }
    if (state.kind === 'agent_loop' && !state.agent_prompt.trim()) {
      setErr('Agent-loop prompt is required.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(buildPayload() as unknown as Record<string, unknown>);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save_failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
      }}
    >
      <Field label="Title">
        <input
          type="text"
          required
          value={state.title}
          onChange={(e) => setState((p) => ({ ...p, title: e.target.value }))}
          style={inputStyle}
          placeholder="Drink water"
        />
      </Field>

      <Field label="Notes (optional)">
        <textarea
          rows={2}
          value={state.notes}
          onChange={(e) => setState((p) => ({ ...p, notes: e.target.value }))}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>

      <Field label="Kind">
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <RadioChip
            active={state.kind === 'notify'}
            onClick={() => setState((p) => ({ ...p, kind: 'notify' }))}
          >
            Notify
          </RadioChip>
          <RadioChip
            active={state.kind === 'agent_loop'}
            tone="accent"
            onClick={() => setState((p) => ({ ...p, kind: 'agent_loop' }))}
          >
            ◐ Agent loop
          </RadioChip>
        </div>
      </Field>

      <Field label="Schedule">
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {(['once', 'daily', 'weekly', 'monthly', 'cron'] as ScheduleKind[]).map((k) => (
            <RadioChip
              key={k}
              active={state.schedule_kind === k}
              onClick={() => setState((p) => ({ ...p, schedule_kind: k }))}
            >
              {k}
            </RadioChip>
          ))}
        </div>
      </Field>

      {state.schedule_kind === 'once' && (
        <Field label="At">
          <input
            type="datetime-local"
            value={state.schedule_at}
            onChange={(e) => setState((p) => ({ ...p, schedule_at: e.target.value }))}
            style={inputStyle}
          />
        </Field>
      )}

      {(state.schedule_kind === 'daily' ||
        state.schedule_kind === 'weekly' ||
        state.schedule_kind === 'monthly') && (
        <Field label="Time (HH:MM, local)">
          <input
            type="time"
            value={state.schedule_time}
            onChange={(e) => setState((p) => ({ ...p, schedule_time: e.target.value }))}
            style={inputStyle}
          />
        </Field>
      )}

      {state.schedule_kind === 'weekly' && (
        <Field label="Days">
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            {DOW_LABEL.map((lab, i) => (
              <RadioChip
                key={lab}
                active={state.schedule_dow.includes(i)}
                onClick={() => toggleDow(i)}
              >
                {lab}
              </RadioChip>
            ))}
          </div>
        </Field>
      )}

      {state.schedule_kind === 'monthly' && (
        <Field label="Day of month (1-31)">
          <input
            type="number"
            min={1}
            max={31}
            value={state.schedule_dom}
            onChange={(e) =>
              setState((p) => ({ ...p, schedule_dom: Math.max(1, Math.min(31, Number(e.target.value) || 1)) }))
            }
            style={inputStyle}
          />
        </Field>
      )}

      {state.schedule_kind === 'cron' && (
        <Field label="Cron (5- or 6-field)">
          <input
            type="text"
            value={state.schedule_cron}
            onChange={(e) => setState((p) => ({ ...p, schedule_cron: e.target.value }))}
            placeholder="0 8-22/2 * * *"
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          />
        </Field>
      )}

      <Field label="Timezone (IANA)">
        <input
          type="text"
          value={state.timezone}
          onChange={(e) => setState((p) => ({ ...p, timezone: e.target.value }))}
          style={inputStyle}
        />
      </Field>

      {state.kind === 'agent_loop' && (
        <>
          <Field label="◐ Prompt">
            <textarea
              rows={4}
              required
              value={state.agent_prompt}
              onChange={(e) => setState((p) => ({ ...p, agent_prompt: e.target.value }))}
              placeholder="e.g. Review my calorie adherence this week, flag days I went over target, and reply with 3 short takeaways."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
          <Field label="Scope (optional — e.g. calorie-lite)">
            <input
              type="text"
              value={state.agent_context}
              onChange={(e) => setState((p) => ({ ...p, agent_context: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Field label="Max steps">
            <input
              type="number"
              min={1}
              max={10}
              value={state.agent_max_steps}
              onChange={(e) =>
                setState((p) => ({
                  ...p,
                  agent_max_steps: Math.max(1, Math.min(10, Number(e.target.value) || 5)),
                }))
              }
              style={inputStyle}
            />
          </Field>
        </>
      )}

      <button
        type="button"
        onClick={() => setShowTemplates((s) => !s)}
        style={{
          background: 'transparent',
          border: '1px dashed var(--color-border-visible)',
          color: 'var(--color-text-secondary)',
          padding: 'var(--space-2) var(--space-3)',
          borderRadius: 'var(--radius-button)',
          cursor: 'pointer',
          fontFamily: 'var(--font-label)',
          fontSize: 'var(--text-caption)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          alignSelf: 'flex-start',
        }}
      >
        {showTemplates ? '× Hide templates' : '◐ Templates'}
      </button>

      {showTemplates && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {TEMPLATES.map((t) => (
            <button
              type="button"
              key={t.title}
              onClick={() => applyTemplate(t)}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                padding: 'var(--space-3) var(--space-4)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  color: 'var(--color-text-display)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {t.title}
              </span>
              <span
                style={{
                  color: t.kind === 'agent_loop' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  fontSize: 'var(--text-caption)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-label)',
                }}
              >
                {t.kind === 'agent_loop' ? '◐ Agent' : 'Notify'} · {t.schedule_kind}
              </span>
            </button>
          ))}
        </div>
      )}

      {err && (
        <div
          className="caption"
          style={{
            color: 'var(--color-accent)',
            fontSize: 'var(--text-caption)',
          }}
        >
          {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="submit"
          disabled={busy}
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-on-accent, #000)',
            border: 0,
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-button)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save reminder'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border-visible)',
            color: 'var(--color-text-secondary)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-button)',
            fontFamily: 'var(--font-label)',
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── UI atoms ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--color-border-visible)',
  borderRadius: 'var(--radius-button)',
  color: 'var(--color-text-display)',
  padding: 'var(--space-2) var(--space-3)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-body)',
  width: '100%',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <span
        className="label"
        style={{
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-caption)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontFamily: 'var(--font-label)',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function RadioChip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'accent';
}) {
  const accent = tone === 'accent';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active
          ? accent
            ? 'var(--color-accent)'
            : 'var(--color-border-visible)'
          : 'transparent',
        color: active
          ? accent
            ? 'var(--color-on-accent, #000)'
            : 'var(--color-text-display)'
          : 'var(--color-text-secondary)',
        border: `1px solid ${accent ? 'var(--color-accent)' : 'var(--color-border-visible)'}`,
        padding: 'var(--space-1) var(--space-3)',
        borderRadius: 'var(--radius-button)',
        fontFamily: 'var(--font-label)',
        fontSize: 'var(--text-caption)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
