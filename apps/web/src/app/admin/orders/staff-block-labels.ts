import type { CommonText } from '@b2b-catalog-platform/shared';
import type { AdminText } from '../../config/admin-text.type';
import { OrderBlockLabels, orderBlockLabels } from '../../orders/order-blocks';

/** The labels staff read an order under: the shared names, their own payment
 * methods and note. */
export function staffBlockLabels(
  names: CommonText,
  orders: AdminText['orders'],
  detail: AdminText['orders']['detail'],
): OrderBlockLabels {
  return orderBlockLabels(names, {
    billingSame: detail.billingSame,
    whenAny: detail.whenAny,
    note: orders.note,
    ...orders.paymentMethods,
  });
}
