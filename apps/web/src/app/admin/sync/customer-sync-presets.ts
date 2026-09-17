import {
  CUSTOMER_SYNC_FIELDS,
  CustomerSyncOptions,
} from '@b2b-catalog-platform/shared';

/**
 * Named intents over a customer run's options (FR-ADM-12), the way the
 * catalog's presets sit over its own.
 *
 * Two of them, because two things are actually done with a file of customers.
 * A **go-live** brings a customer book into a shop that has none: it creates
 * accounts, which means mailing every one of those people a set-a-password
 * link, and it is the reason this upload exists at all. A **tier update**
 * touches nobody's access and nobody's inbox — it writes the one field
 * iteration 12 left assigned by hand.
 *
 * The risky one is the default here, unlike the catalog's, and that is
 * deliberate rather than an oversight: the risk in a customer file is the mail
 * it sends, which the preview counts before anything is applied, and a
 * go-live that quietly declined to create the accounts would be a screen that
 * did nothing and said it worked.
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
  };

  // A tier file is about people the shop already has. Creating nobody is what
  // makes it safe to run against an export that happens to carry more rows
  // than the shop has customers.
  if (name === 'tiers') {
    return { ...base, fields: ['tier'], createMissing: false };
  }
  return base;
}
