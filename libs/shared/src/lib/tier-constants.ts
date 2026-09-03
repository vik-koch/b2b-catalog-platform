/**
 * Customer-tier limits and the refusals the tier screens render. Plain data
 * with no imports, so the tier list does not pull the tier schemas — and Zod —
 * into its chunk (see `auth-constants.ts` for why).
 */

/** Matches the `customer_tiers.key` varchar(64). */
export const TIER_KEY_MAX_LENGTH = 64;

/** Matches the `customer_tiers.label` varchar(255). */
export const TIER_LABEL_MAX_LENGTH = 255;

/**
 * Why a tier action was refused. `tier-has-*` are the delete guard, and the
 * list already knows both counts, so it says which of its own numbers is in the
 * way without the server phrasing it.
 */
export const TIER_ERROR_CODES = [
  'tier-not-found',
  'tier-key-taken',
  'tier-has-accounts',
  'tier-has-prices',
] as const;
