/**
 * Cart limits both sides share. Plain data with no imports, so a component that
 * needs a maximum does not pull the cart schemas — and Zod — along with it
 * (see `auth-constants.ts` for why).
 */

/**
 * How many distinct lines may be priced in one call. A bound, not a business
 * rule: this is an unauthenticated N-product lookup, and a hand-written body
 * must not be able to ask for ten thousand.
 */
export const CART_LINES_MAX = 100;

/** One note describes a whole line ("100 in colour A, 100 in colour B"), so it
 * has room to. */
export const CART_NOTE_MAX = 500;
