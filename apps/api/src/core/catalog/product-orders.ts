/**
 * What catalog asks about the orders of its products. Catalog may not import
 * ordering, so ordering answers through this and the app root wires it.
 */
export interface ProductOrders {
  /** The ids among `productIds` an order line names: an ordered product is
   * never deleted permanently. */
  orderedAmong(productIds: readonly string[]): Promise<Set<string>>;
}

export const PRODUCT_ORDERS = 'PRODUCT_ORDERS';
