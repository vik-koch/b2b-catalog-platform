import type {
  SettingChangeRecord,
  SettingsDecision,
  SettingsRow,
  SettingsStore,
} from './settings-store';

/**
 * A store holding `row` in memory, for specs of the switches that write
 * through it: `change` runs the decision against the row and keeps what it
 * set and recorded, which is all a switch's own rules can be asked about.
 */
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
