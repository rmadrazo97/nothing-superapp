/**
 * Reusable in-sub-app settings framework.
 *
 * One-stop import so mini-apps can build their settings panel from
 * pre-styled primitives that already match the Nothing Superapp design
 * language + wire up to the shared `mini_app_settings` store.
 *
 *   import {
 *     MiniAppSettingsPanel,
 *     SettingsSection,
 *     SettingsField,
 *     SettingsSelect,
 *     SettingsToggle,
 *     SettingsButton,
 *     useMiniAppSettings,
 *   } from '@/components/mini-app-settings';
 *
 * Mini-apps in separate packages reach in via the same relative-reach
 * pattern they already use for `useToast`:
 *   `../../web/src/components/mini-app-settings`
 */
export { MiniAppSettingsPanel } from './MiniAppSettingsPanel';
export type { MiniAppSettingsPanelProps } from './MiniAppSettingsPanel';

export { SettingsSection } from './SettingsSection';
export type { SettingsSectionProps } from './SettingsSection';

export { SettingsField } from './SettingsField';
export type { SettingsFieldProps } from './SettingsField';

export { SettingsSelect } from './SettingsSelect';
export type {
  SettingsSelectProps,
  SettingsSelectOption,
} from './SettingsSelect';

export { SettingsToggle } from './SettingsToggle';
export type { SettingsToggleProps } from './SettingsToggle';

export { SettingsButton } from './SettingsButton';
export type {
  SettingsButtonProps,
  SettingsButtonVariant,
} from './SettingsButton';

export { useMiniAppSettings } from './useMiniAppSettings';
export type { UseMiniAppSettings } from './useMiniAppSettings';

export {
  SECTION_CARD_STYLE,
  SECTION_KICKER_STYLE,
  SECTION_TITLE_STYLE,
  FIELD_LABEL_STYLE,
  FIELD_HELPER_STYLE,
  INPUT_STYLE,
  PRIMARY_BTN_STYLE,
  GHOST_BTN_STYLE,
  sectionEyebrow,
} from './tokens';
