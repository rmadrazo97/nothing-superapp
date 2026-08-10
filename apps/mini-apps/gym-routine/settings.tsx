'use client';

/**
 * Gym — per-mini-app settings panel.
 *
 * Wired through the reusable in-sub-app settings framework
 * (see apps/web/src/components/mini-app-settings). Two unit selectors:
 *
 *   SECTION 01 · UNITS
 *     WEIGHT  → LBS | KG   (default LBS)
 *     LENGTH  → IN  | CM   (default IN)
 *
 * Behaviour: WEIGHT and LENGTH are stored independently but "coupled" on
 * first save — flipping WEIGHT to KG when LENGTH is still default IN
 * also flips LENGTH to CM, and vice versa. Once the user has explicitly
 * touched either field, they're fully independent (a user who wants KG
 * weights + inches length is respected).
 *
 * Writes go through the debounced-optimistic hook so a rapid tap-tap on
 * a pill collapses into one PATCH.
 */
import { useCallback, useRef } from 'react';
import {
  MiniAppSettingsPanel,
  SettingsSection,
  SettingsField,
  SettingsSelect,
  useMiniAppSettings,
} from '../../web/src/components/mini-app-settings';
import {
  GYM_SETTINGS_DEFAULTS,
  type GymSettings,
  type WeightUnit,
  type LengthUnit,
} from './lib/settings.ts';

export default function GymSettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings, isLoading } = useMiniAppSettings<GymSettings>(
    'gym-routine',
    GYM_SETTINGS_DEFAULTS,
  );

  // Track whether the user has explicitly changed each field this session.
  // Used only for the metric-coupling nudge on first flip — after they've
  // touched a field once, we never auto-touch it on their behalf again.
  const touched = useRef<{ weight: boolean; length: boolean }>({
    weight: false,
    length: false,
  });

  const onWeightChange = useCallback(
    (next: WeightUnit) => {
      const patch: Partial<GymSettings> = { weightUnit: next };
      // First flip only: couple LBS↔IN + KG↔CM if length hasn't been
      // explicitly changed yet.
      if (!touched.current.length) {
        patch.lengthUnit = next === 'kg' ? 'cm' : 'in';
      }
      touched.current.weight = true;
      updateSettings(patch);
    },
    [updateSettings],
  );

  const onLengthChange = useCallback(
    (next: LengthUnit) => {
      const patch: Partial<GymSettings> = { lengthUnit: next };
      if (!touched.current.weight) {
        patch.weightUnit = next === 'cm' ? 'kg' : 'lbs';
      }
      touched.current.length = true;
      updateSettings(patch);
    },
    [updateSettings],
  );

  return (
    <MiniAppSettingsPanel name="Gym" onBack={onClose}>
      <SettingsSection number={1} title="Units">
        <SettingsField
          label="Weight"
          helper="Used everywhere you log or view a working weight."
        >
          <SettingsSelect<WeightUnit>
            ariaLabel="Weight unit"
            value={settings.weightUnit}
            disabled={isLoading}
            onChange={onWeightChange}
            options={[
              { value: 'lbs', label: 'LBS' },
              { value: 'kg', label: 'KG' },
            ]}
          />
        </SettingsField>

        <SettingsField
          label="Length"
          helper="Used for exercise ranges (e.g. bar path, box height)."
        >
          <SettingsSelect<LengthUnit>
            ariaLabel="Length unit"
            value={settings.lengthUnit}
            disabled={isLoading}
            onChange={onLengthChange}
            options={[
              { value: 'in', label: 'IN' },
              { value: 'cm', label: 'CM' },
            ]}
          />
        </SettingsField>
      </SettingsSection>
    </MiniAppSettingsPanel>
  );
}
