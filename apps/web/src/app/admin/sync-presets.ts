import { SYNC_ALL_FIELDS, SyncOptions } from '@b2b-catalog-platform/shared';

/**
 * Named intents over the raw run options. The flag space is larger than anyone
 * should reason about while holding a catalog file, and only two combinations
 * are actually used: a complete export, and a price refresh. The presets make
 * the safe one the default and keep the dangerous option out of reach of the
 * one that must never delete.
 */
export type SyncPresetName = 'full' | 'prices' | 'custom';

export interface SyncPreset {
  name: SyncPresetName;
  /** Keys into the `adminSync` text block. */
  label: 'modeFull' | 'modePrices' | 'modeCustom';
  hint?: 'modeFullHint' | 'modePricesHint';
}

export const SYNC_PRESETS: SyncPreset[] = [
  { name: 'full', label: 'modeFull', hint: 'modeFullHint' },
  { name: 'prices', label: 'modePrices', hint: 'modePricesHint' },
  { name: 'custom', label: 'modeCustom' },
];

/**
 * The options a preset stands for. "Complete catalog export" claims authority
 * over the product set but still leaves the actual hiding switched off — the
 * claim is what makes the option *available*, not what enables it.
 */
export function presetFor(name: SyncPresetName): SyncOptions {
  const base: SyncOptions = {
    fields: [...SYNC_ALL_FIELDS],
    createMissing: true,
    updateExisting: true,
    restoreReturning: true,
    createCategories: true,
    productSetAuthoritative: false,
    softDeleteMissingProducts: false,
  };

  if (name === 'prices') {
    return {
      ...base,
      fields: [],
      createMissing: false,
      createCategories: false,
      restoreReturning: false,
    };
  }
  if (name === 'full') {
    return { ...base, productSetAuthoritative: true };
  }
  return base;
}
