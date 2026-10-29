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
  /** Deleting the list guests are charged. Exactly one tier carries the badge
   * and every read path depends on it existing, so it is moved, never removed:
   * badge another list first, and this one becomes an ordinary tier. */
  'tier-is-default',
] as const;

/**
 * The shape a price list's sync key can take — any script, so a deployment
 * writes its own commercial vocabulary, but one word: it goes into a
 * `price:<key>` column header that somebody types into a spreadsheet, so no
 * spaces, no colon, nothing that needs quoting.
 *
 * Deliberately looser than it once was and deliberately not as loose as
 * `sourceId`, which has no shape rule at all: a source id is a value we are
 * handed by a system we do not control, while this is an identifier the admin
 * mints here and then writes into a header of our own syntax.
 */
export const TIER_KEY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
