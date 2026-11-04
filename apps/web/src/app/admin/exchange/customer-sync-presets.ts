import {
  CUSTOMER_SYNC_FIELDS,
  CustomerSyncOptions,
} from '@b2b-catalog-platform/shared/core/exchange';

/**
 * Named intents over a customer run's options (FR-ADM-12): a go-live, which
 * creates accounts and mails each a link, and a tier update, which touches
 * nobody's access or inbox. The go-live is the default on purpose: the
 * preview counts its mails, and one that created nobody would do nothing.
 */
export type CustomerSyncPresetName = 'full' | 'tiers' | 'custom';

export interface CustomerSyncPreset {
  name: CustomerSyncPresetName;
  /** Keys into the sync text block's `customers.mode` group. */
  label: CustomerSyncPresetName;
  hint?: 'fullHint' | 'tiersHint';
}

export const CUSTOMER_SYNC_PRESETS: CustomerSyncPreset[] = [
  { name: 'full', label: 'full', hint: 'fullHint' },
  { name: 'tiers', label: 'tiers', hint: 'tiersHint' },
  { name: 'custom', label: 'custom' },
];

/** The options a preset stands for. */
export function customerPresetFor(
  name: CustomerSyncPresetName,
): CustomerSyncOptions {
  const base: CustomerSyncOptions = {
    fields: [...CUSTOMER_SYNC_FIELDS],
    createMissing: true,
    updateExisting: true,
    // Ticked by hand: a wrong address would adopt the wrong person's account
    // (FR-ADM-17).
    claimByEmail: false,
    // Never on an upload: the ID comes from the machine read (FR-ADM-18).
    claimById: false,
  };

  // Creating nobody keeps it safe against an export with extra rows.
  if (name === 'tiers') {
    return { ...base, fields: ['tier'], createMissing: false };
  }
  return base;
}
