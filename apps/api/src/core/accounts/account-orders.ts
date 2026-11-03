/**
 * What accounts ask about a customer's orders. Accounts may not import
 * ordering, so ordering answers through this and the app root wires it.
 */
export interface AccountOrders {
  /** Orders the shop is still working on (FR-AUTH-06). They refuse nothing. */
  countOpen(userId: string): Promise<number>;
  /** Counted before the erasure makes them untraceable (FR-NOTIF-08). */
  count(userId: string): Promise<number>;
}

export const ACCOUNT_ORDERS = 'ACCOUNT_ORDERS';
