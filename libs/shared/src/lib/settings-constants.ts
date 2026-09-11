/**
 * Runtime-setting vocabulary. Import-free so the panel can key its wording off
 * a change's kind without pulling the settings schemas in to do it.
 */

/**
 * Which setting a recorded change was about. Both runtime settings are here,
 * not only the one this record was built for: a history that answered "who
 * handed the catalog over" but not "who closed the shop" would be a trail with
 * a hole in it, and the two are read in the same breath when something is off.
 */
export const SETTING_CHANGE_KINDS = ['maintenance', 'ownership'] as const;
export type SettingChangeKind = (typeof SETTING_CHANGE_KINDS)[number];

/** How many changes the history shows. Recent, not exhaustive. */
export const SETTING_CHANGES_PAGE_SIZE = 20;
