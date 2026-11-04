import {
  CATALOG_SYNC_ALL_FIELDS,
  CatalogSyncOptions,
} from '@b2b-catalog-platform/shared/core/exchange';

/**
 * Named intents over the run options: the three combinations actually used.
 * The safe one is the default, and the ones that must never delete cannot
 * reach the option that does.
 */
export type CatalogSyncPresetName = 'full' | 'prices' | 'stock' | 'custom';

export interface CatalogSyncPreset {
  name: CatalogSyncPresetName;
  /** Keys into the sync text block's `mode` group. */
  label: 'full' | 'prices' | 'stock' | 'custom';
  hint?: 'fullHint' | 'pricesHint' | 'stockHint';
}

export const CATALOG_SYNC_PRESETS: CatalogSyncPreset[] = [
  { name: 'full', label: 'full', hint: 'fullHint' },
  { name: 'prices', label: 'prices', hint: 'pricesHint' },
  { name: 'stock', label: 'stock', hint: 'stockHint' },
  { name: 'custom', label: 'custom' },
];

/** A complete export claims the product set but leaves hiding off: the
 * claim makes the option available, not enabled. */
export function catalogPresetFor(
  name: CatalogSyncPresetName,
): CatalogSyncOptions {
  const base: CatalogSyncOptions = {
    fields: [...CATALOG_SYNC_ALL_FIELDS],
    createMissing: true,
    updateExisting: true,
    restoreReturning: true,
    createCategories: true,
    productSetAuthoritative: false,
    softDeleteMissingProducts: false,
  };

  // Both refreshes touch what is there, add nothing, hide nothing.
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
