/**
 * Address field bounds and what a lookup may ask for. Plain data with no
 * imports, so the address form does not pull the address schemas — and Zod —
 * along with the one limit it needs (see `auth-constants.ts` for why).
 */

/** An optional short name for the row, to tell two addresses apart. */
export const ADDRESS_LABEL_MAX_LENGTH = 100;

/** Matches the varchar the columns carry; a bound, not an editorial rule. */
export const ADDRESS_LINE_MAX_LENGTH = 255;

/**
 * The address book (FR-CART-04) and the suggestion that fills a form in it
 * (FR-CART-11). Both live here rather than on the account contract: a guest
 * checks out with an address too, so only the *book* is account-scoped.
 */

export const ADDRESS_POSTAL_CODE_MAX_LENGTH = 32;

/**
 * NFR-SEC-08: the suggestion endpoint is metered, so the query is bounded at
 * both ends — too short and every keystroke is a paid call that cannot match
 * anything useful.
 */
export const ADDRESS_QUERY_MIN_LENGTH = 3;

export const ADDRESS_QUERY_MAX_LENGTH = 120;

export const ADDRESS_SUGGESTION_LIMIT = 8;
