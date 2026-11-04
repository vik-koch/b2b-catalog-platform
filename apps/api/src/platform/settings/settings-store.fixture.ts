import type {
  SettingChangeRecord,
  SettingsDecision,
  SettingsRow,
  SettingsStore,
} from './settings-store';

/** A store holding `row` in memory, keeping what each `change` set and
 * recorded. */
export function storeHolding(row: Partial<SettingsRow> = {}) {
  let current: SettingsRow = {
    maintenanceMode: false,
    externallyOwnedAreas: [],
    ...row,
  };
  const recorded: SettingChangeRecord[] = [];
  const store = {
    current: () => current,
    read: async () => current,
    change: async (
      _actor: unknown,
      decide: (before: SettingsRow) => SettingsDecision,
    ) => {
      const { set, record } = decide(current);
      current = { ...current, ...set };
      recorded.push(...record);
      return current;
    },
  };
  return { store: store as unknown as SettingsStore, recorded };
}
