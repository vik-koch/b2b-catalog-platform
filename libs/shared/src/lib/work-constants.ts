/**
 * The vocabulary of work awaiting attention (FR-WORK-01…04). Plain data with
 * no imports, so the navbar marker does not pull the work schemas — and Zod —
 * into the first load (see `auth-constants.ts` for why).
 */

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
  /** Products no price list prices, so nobody can publish them. Admin. */
  'unpricedProducts',
  /** Documents whose expiry has passed (FR-DOC-04). Admin. */
  'expiredDocuments',
  /** Documents whose expiry is within the warning window (FR-DOC-04). Admin. */
  'expiringDocuments',
  /**
   * Catalog sync runs staged for a person to review (FR-ADM-07). Admin.
   *
   * One queue per area rather than one figure over all of them: a staged
   * catalog run is an admin's to answer and a staged customer run is a
   * manager's too (FR-ADM-09), so a single count would show a manager work
   * they cannot finish — and a count that links somewhere its reader may not
   * go is worse than no count.
   */
  'stagedCatalogRuns',
  /** Customer sync runs staged for a person to review (FR-ADM-09). Staff. */
  'stagedCustomerRuns',
  /** Orders handed over and not recorded as paid (FR-ORD-04). Staff. */
  'unpaidOrders',
  /** The account's own orders whose money the shop is waiting for. */
  'myPayments',
  /** The account's own orders packed and waiting to be collected. */
  'myPickups',
] as const;
export type WorkQueue = (typeof WORK_QUEUES)[number];
