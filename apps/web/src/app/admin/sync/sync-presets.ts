import { SYNC_ALL_FIELDS, SyncOptions } from '@b2b-catalog-platform/shared';

/**
 * Named intents over the raw run options. The flag space is larger than anyone
 * should reason about while holding a catalog file, and only three
 * combinations are actually used: a complete export, a price refresh and a
 * stock refresh. The presets make the safe one the default and keep the
 * dangerous option out of reach of the ones that must never delete.
 */
export type SyncPresetName = 'full' | 'prices' | 'stock' | 'custom';

export interface SyncPreset {
  name: SyncPresetName;
  /** Keys into the sync text block's `mode` group. */
  label: 'full' | 'prices' | 'stock' | 'custom';
  hint?: 'fullHint' | 'pricesHint' | 'stockHint';
}

export const SYNC_PRESETS: SyncPreset[] = [
  { name: 'full', label: 'full', hint: 'fullHint' },
  { name: 'prices', label: 'prices', hint: 'pricesHint' },
  { name: 'stock', label: 'stock', hint: 'stockHint' },
  { name: 'custom', label: 'custom' },
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

  // The two partial refreshes are the same shape — touch what is already
  // there, add nothing, hide nothing — and differ only in which field they
  // carry. A stock file is the one a shop sends daily.
  if (name === 'prices' || name === 'stock') {
    return {
      ...base,
      fields: name === 'stock' ? ['stock'] : [],
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
