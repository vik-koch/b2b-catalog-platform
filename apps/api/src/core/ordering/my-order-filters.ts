import { MyOrderFilter } from '@b2b-catalog-platform/shared/core/ordering';
import { and, eq, SQL } from 'drizzle-orm';
import { orderRevisions, orders } from '../../db/schema';

/** What waits on a customer, over `orders` joined to the revision they are on.
 * Their list filters by it and the work marker counts it, so the two agree. */
export const MY_ORDER_CONDITIONS: Record<MyOrderFilter, SQL> = {
  'to-pay': eq(orders.paymentState, 'awaiting'),
  'to-collect': and(
    eq(orders.status, 'ready'),
    eq(orderRevisions.fulfilmentMethod, 'pickup'),
  ) as SQL,
};
