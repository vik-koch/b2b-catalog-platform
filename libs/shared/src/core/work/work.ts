/**
 * Every queue the app counts (FR-WORK-01…04). A queue is work of one kind that
 * one role can finish, with the list that resolves it one link away.
 */
export const WORK_QUEUES = [
  /** Registrations awaiting approval (FR-AUTH-01). Staff. */
  'registrations',
  /** Orders nobody has answered yet (FR-CART-03). Staff. */
  'orders',
  /** Priced products off the storefront, ready to publish (FR-ADM-06). Admin. */
  'unpublishedProducts',
  /** Products no price list prices, so nobody can publish them. Admin. */
  'unpricedProducts',
  /** Documents whose expiry has passed (FR-DOC-04). Admin. */
  'expiredDocuments',
  /** Documents inside the warning window (FR-DOC-04). Admin. */
  'expiringDocuments',
  /** Catalog sync runs staged for review (FR-ADM-07). Admin. A queue per
   * area, because a manager answers customer runs only (FR-ADM-09). */
  'stagedCatalogRuns',
  /** Customer sync runs staged for review (FR-ADM-09). Staff. */
  'stagedCustomerRuns',
  /** Orders handed over and not recorded as paid (FR-ORD-04). Staff. */
  'unpaidOrders',
  /** The account's own orders whose money the shop is waiting for. */
  'myPayments',
  /** The account's own orders packed and waiting to be collected. */
  'myPickups',
] as const;
export type WorkQueue = (typeof WORK_QUEUES)[number];
