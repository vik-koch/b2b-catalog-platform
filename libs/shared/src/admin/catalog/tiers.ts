/** Matches the `customer_tiers.label` varchar(255). */
export const TIER_LABEL_MAX_LENGTH = 255;

/** `tier-has-*` are the delete guard; the list already shows both counts. */
export const TIER_ERROR_CODES = [
  'tier-not-found',
  'tier-key-taken',
  'tier-has-accounts',
  'tier-has-prices',
  /** Deleting the badged list, which every read depends on: badge another
   * first. */
  'tier-is-default',
] as const;
export type TierErrorCode = (typeof TIER_ERROR_CODES)[number];

/**
 * A price list's sync key: one word in any script. It goes into a `price:<key>`
 * column header typed into a spreadsheet, so no spaces, colon or anything that
 * needs quoting.
 */
export const TIER_KEY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
