/** The runtime settings the settings row holds, each logged in one trail. */
export const SETTING_CHANGE_KINDS = ['maintenance', 'ownership'] as const;
export type SettingChangeKind = (typeof SETTING_CHANGE_KINDS)[number];
