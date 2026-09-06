'use client';

/**
 * PlanDayEditor — editable variant of PlanDayCard, used when the v2 routine
 * editor is in "manage" mode.
 *
 * Scope of editing:
 *   - Rename day (name_en)
 *   - Rename each exercise (name_en) and toggle body-weight equipment
 *   - Straight + top_set_backoff: edit each block's sets + reps min/max +
 *     optional RIR range
 *   - Superset: edit rounds + each component's sets/reps and name
 *   - Delete an exercise (any structure)
 *   - Delete a day (parent handles this via `onDeleteDay`)
 *
 * We deliberately don't expose adding new exercises here — for v0 the user
 * can delete then re-import via the assistant. Add-exercise flow needs an
 * exercise picker sheet which is a bigger UX story.
 */
import type {
  PlanDay,
  PlanExercise,
  ExerciseBlock,
  SupersetComponent,
} from '@nothing/shared';
import { cardStyle, ghostButtonStyle, inputStyle, chipStyle } from '../lib/ui.ts';
import { isBodyWeightEquipment } from '../lib/settings.ts';

export interface PlanDayEditorProps {
  day: PlanDay;
  onChange: (day: PlanDay) => void;
  onDeleteDay: () => void;
}

const rangeInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: 'var(--space-2)',
  minHeight: 36,
  fontSize: 'var(--text-body-sm, 14px)',
};

const smallLabel: React.CSSProperties = {
  fontFamily: 'var(--font-label)',
  fontSize: 'var(--text-label)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--color-text-disabled)',
};

function BlockEditor({
  block,
  onChange,
}: {
  block: ExerciseBlock;
  onChange: (b: ExerciseBlock) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
        gap: 'var(--space-2)',
        alignItems: 'end',
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={smallLabel}>SETS</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          value={block.sets}
          onChange={(e) =>
            onChange({ ...block, sets: Math.max(1, Number(e.target.value) || 1) })
          }
          style={rangeInputStyle}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={smallLabel}>REPS MIN</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          value={block.reps.min}
          onChange={(e) => {
            const min = Math.max(0, Number(e.target.value) || 0);
            onChange({
              ...block,
              reps: { min, max: Math.max(min, block.reps.max) },
            });
          }}
          style={rangeInputStyle}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={smallLabel}>REPS MAX</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          value={block.reps.max}
          onChange={(e) => {
            const max = Math.max(0, Number(e.target.value) || 0);
            onChange({
              ...block,
              reps: { min: Math.min(max, block.reps.min), max },
            });
          }}
          style={rangeInputStyle}
        />
      </label>
    </div>
  );
}

function ComponentEditor({
  component,
  onChange,
}: {
  component: SupersetComponent;
  onChange: (c: SupersetComponent) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <input
        type="text"
        value={component.name_en ?? component.name_es ?? ''}
        onChange={(e) => onChange({ ...component, name_en: e.target.value })}
        placeholder="Component name"
        style={{ ...rangeInputStyle, minHeight: 40 }}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
          gap: 'var(--space-2)',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={smallLabel}>SETS</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={component.sets}
            onChange={(e) =>
              onChange({ ...component, sets: Math.max(1, Number(e.target.value) || 1) })
            }
            style={rangeInputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={smallLabel}>REPS MIN</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            value={component.reps.min}
            onChange={(e) => {
              const min = Math.max(0, Number(e.target.value) || 0);
              onChange({
                ...component,
                reps: { min, max: Math.max(min, component.reps.max) },
              });
            }}
            style={rangeInputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={smallLabel}>REPS MAX</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            value={component.reps.max}
            onChange={(e) => {
              const max = Math.max(0, Number(e.target.value) || 0);
              onChange({
                ...component,
                reps: { min: Math.min(max, component.reps.min), max },
              });
            }}
            style={rangeInputStyle}
          />
        </label>
      </div>
    </div>
  );
}

function ExerciseEditor({
  exercise,
  onChange,
  onDelete,
}: {
  exercise: PlanExercise;
  onChange: (ex: PlanExercise) => void;
  onDelete: () => void;
}) {
  const isBW = isBodyWeightEquipment(exercise.equipment);
  const displayName = exercise.name_en ?? exercise.name_es ?? '';

  const toggleBw = () => {
    // Equipment field is free-form on the plan schema; use a canonical
    // "body_only" for BW to match the exercise catalog convention.
    onChange({
      ...exercise,
      equipment: isBW ? '' : 'body_only',
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        <span
          style={{
            ...smallLabel,
            color: 'var(--color-text-secondary)',
            minWidth: 24,
          }}
        >
          {String(exercise.order).padStart(2, '0')}
        </span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => onChange({ ...exercise, name_en: e.target.value })}
          placeholder="Exercise name"
          style={{
            ...rangeInputStyle,
            minHeight: 40,
            fontSize: 'var(--text-body)',
            flex: '1 1 200px',
          }}
        />
        <button
          type="button"
          onClick={toggleBw}
          aria-pressed={isBW}
          style={{
            ...chipStyle(isBW),
            padding: 'var(--space-1) var(--space-3)',
          }}
          title={isBW ? 'Body weight — tap to switch' : 'Weighted — tap for body weight'}
        >
          {isBW ? '● BW' : '○ BW'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${displayName}`}
          style={{
            ...ghostButtonStyle,
            minHeight: 40,
            padding: 'var(--space-2) var(--space-3)',
            color: 'var(--color-text-secondary)',
          }}
        >
          ×
        </button>
      </div>

      {exercise.structure === 'superset' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <span style={smallLabel}>ROUNDS</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={exercise.rounds}
              onChange={(e) =>
                onChange({
                  ...exercise,
                  rounds: Math.max(1, Number(e.target.value) || 1),
                })
              }
              style={{ ...rangeInputStyle, width: 80 }}
            />
          </label>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {exercise.components.map((c, i) => (
              <li key={c.order}>
                <ComponentEditor
                  component={c}
                  onChange={(next) =>
                    onChange({
                      ...exercise,
                      components: exercise.components.map((old, j) =>
                        j === i ? next : old,
                      ),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {exercise.blocks.map((b, i) => (
            <li key={i}>
              <div style={{ ...smallLabel, marginBottom: 2 }}>
                {b.role === 'top_set'
                  ? 'TOP SET'
                  : b.role === 'backoff'
                    ? 'BACKOFF'
                    : 'STRAIGHT'}
              </div>
              <BlockEditor
                block={b}
                onChange={(next) =>
                  onChange({
                    ...exercise,
                    blocks: exercise.blocks.map((old, j) => (j === i ? next : old)),
                  } as PlanExercise)
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PlanDayEditor({ day, onChange, onDeleteDay }: PlanDayEditorProps) {
  const dayName = day.name_en ?? day.name_es ?? `Day ${day.day}`;

  return (
    <section
      aria-label={dayName}
      style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span className="label" style={{ color: 'var(--color-text-secondary)' }}>
          DAY {String(day.day).padStart(2, '0')} · EDIT
        </span>
        <button
          type="button"
          onClick={onDeleteDay}
          style={{
            ...ghostButtonStyle,
            minHeight: 36,
            padding: 'var(--space-1) var(--space-3)',
            color: 'var(--color-text-secondary)',
          }}
        >
          × REMOVE DAY
        </button>
      </div>
      <input
        type="text"
        value={dayName}
        onChange={(e) => onChange({ ...day, name_en: e.target.value })}
        style={{
          ...rangeInputStyle,
          minHeight: 44,
          fontSize: 'var(--text-subheading)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {day.exercises.map((ex, i) => (
          <ExerciseEditor
            key={ex.id}
            exercise={ex}
            onChange={(next) =>
              onChange({
                ...day,
                exercises: day.exercises.map((old, j) => (j === i ? next : old)),
              })
            }
            onDelete={() =>
              onChange({
                ...day,
                exercises: day.exercises.filter((_, j) => j !== i),
              })
            }
          />
        ))}
        {day.exercises.length === 0 && (
          <p className="caption" style={{ color: 'var(--color-text-disabled)', padding: 'var(--space-3) 0' }}>
            All exercises removed. Delete this day or add exercises via the assistant.
          </p>
        )}
      </div>
    </section>
  );
}
