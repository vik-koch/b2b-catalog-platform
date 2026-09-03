/**
 * What an order may say and how much of it. Plain data with no imports, so
 * checkout does not pull the order schemas — and Zod — into the first load
 * (see `auth-constants.ts` for why).
 */

/**
 * Where an order stands. Only `requested` is ever written today; the rest are
 * the transitions a manager gets later, listed now so the column's check
 * constraint and the read contract agree from the start.
 */
export const ORDER_STATUSES = [
  'requested',
  'approved',
  'declined',
  'cancelled',
] as const;

/**
 * How the staff list is ordered (FR-AUTH-03).
 *
 * `status` is the default and the reason this exists: it puts the orders
 * nobody has answered yet at the top, which is the question the list is opened
 * with. Requested first, then approved, then the two ways an order ends; each
 * group newest first, as the list has always been.
 */
export const STAFF_ORDER_SORTS = [
  'status',
  'status_desc',
  'placed',
  'placed_desc',
] as const;

/** How the goods reach the customer. */
export const FULFILMENT_METHODS = ['delivery', 'pickup'] as const;

/**
 * How it is paid. `card-later` is a card payment arranged with the manager
 * after confirmation — the platform takes no payment itself, which is why no
 * method here implies a transaction.
 */
export const PAYMENT_METHODS = ['cash', 'bank-transfer', 'card-later'] as const;

export const ORDER_NOTE_MAX = 1000;

/** A key from the deployment's `locations`, validated against it server-side. */
export const PICKUP_LOCATION_KEY_MAX = 64;

/** Registration numbers are compared in one form everywhere. */
export const PARTY_NAME_MAX = 255;

export const ORDER_PAGE_SIZE = 20;

/** As long as the longest thing anybody pastes in: an email address. */
export const ORDER_QUERY_MAX_LENGTH = 200;
