/**
 * The vocabulary of work awaiting attention (FR-WORK-01…04). Plain data with
 * no imports, so the navbar marker does not pull the work schemas — and Zod —
 * into the first load (see `auth-constants.ts` for why).
 */

import type { ORDER_STATUSES } from './order-constants';

/**
 * Every queue the app can count, in the order a panel lists them.
 *
 * A key is a queue, not a screen: it names work of one kind that one role can
 * finish, and the panel that shows it also holds the link that resolves it.
 * Adding one is a query and a line of text — nothing here is stored (ADR 0046).
 */
export const WORK_QUEUES = [
  /** Registrations awaiting approval (FR-AUTH-01). Staff. */
  'registrations',
  /** Orders nobody has answered yet (FR-CART-03). Staff. */
  'orders',
  /** Products a sync left off the storefront (FR-ADM-06). Admin. */
  'unpublishedProducts',
  /** Documents expired or about to expire (FR-DOC-04). Admin. */
  'expiringDocuments',
  /** The account's own orders that wait on the account holder. */
  'myOrders',
] as const;
export type WorkQueue = (typeof WORK_QUEUES)[number];

/**
 * Order statuses that wait on the *customer* rather than on the shop.
 *
 * Empty today, and deliberately so: the only status an order is ever written
 * in is `requested`, which waits on staff, and the states that would wait on a
 * customer — an approved order still to be paid — arrive with order processing.
 * A count over an empty set is zero, so a customer's marker simply never lights
 * until then. Listing `approved` here now would be the badge lying in the other
 * direction: nothing yet records that a payment happened, so the count could
 * never clear (FR-WORK-02).
 */
export const CUSTOMER_WAITING_ORDER_STATUSES: readonly (typeof ORDER_STATUSES)[number][] =
  [];
