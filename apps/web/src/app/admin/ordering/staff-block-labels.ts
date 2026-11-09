import type { SharedOrderingText } from '@b2b-catalog-platform/shared/core/ordering';

import {
  OrderBlockLabels,
  orderBlockLabels,
} from '../../core/ordering/order-blocks';
import type { AdminOrderingText } from './ordering-text.type';

/** The labels staff read an order under: the shared names, their own payment
 * methods and note. */
export function staffBlockLabels(
  names: SharedOrderingText,
  orders: AdminOrderingText['orders'],
  detail: AdminOrderingText['orders']['detail'],
): OrderBlockLabels {
  return orderBlockLabels(names, {
    billingSame: detail.billingSame,
    whenAny: detail.whenAny,
    note: orders.note,
    ...orders.paymentMethods,
  });
}
