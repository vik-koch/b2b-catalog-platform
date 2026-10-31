/**
 * Both runtime settings: who closed the shop is read in the same breath as who
 * handed an area over.
 */
export const SETTING_CHANGE_KINDS = ['maintenance', 'ownership'] as const;
export type SettingChangeKind = (typeof SETTING_CHANGE_KINDS)[number];

/** Recent, not exhaustive. */
export const SETTING_CHANGES_PAGE_SIZE = 20;
