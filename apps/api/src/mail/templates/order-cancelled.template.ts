import { SharedText, MoneyFormat } from '@b2b-catalog-platform/shared';
import { AdminOrderDetail } from '@b2b-catalog-platform/shared/admin';
import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';
import {
  orderLinesDifferInTax,
  orderMailItem,
  orderMailTotal,
} from './order-items';

/**
 * Sent to the shop when a customer calls their own order off (FR-NOTIF-07).
 *
 * The counterpart of the arrival notification, and for the same reason: the
 * order left the queue that a manager watches, and the one thing they cannot
 * afford to learn late is that an order they were packing is no longer wanted.
 *
 * It repeats the reason the customer gave, where they gave one — asking is a
 * courtesy and not a condition (FR-ORD-02), so half of these arrive without —
 * and the lines, because what a manager does next is put them back on the
 * shelf.
 */
export function orderCancelledMail(
  order: AdminOrderDetail,
  currency: MoneyFormat,
  text: MailText,
  common: SharedText,
): MailContent {
  const t = text.orderCancelled;
  const names = common.order;

  return {
    subject: `${t.subject} · ${order.reference}`,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [
      t.body,
      // Money the shop is holding on an order that is now off. Nothing here
      // moves it — a refund happens in the shop's books — so this sentence is
      // the whole of the prompt.
      ...(order.paymentState === 'paid' ? [t.paidNote] : []),
    ],
    rows: [
      { label: names.reference, value: order.reference },
      {
        label: text.orders.account,
        value: order.customerEmail ?? text.orders.guest,
      },
      {
        label: names.contact,
        value: [order.contact.name, order.contact.phone].join(' · '),
      },
      { label: t.reasonLabel, value: order.statusReason ?? t.reasonNone },
      {
        label: names.total,
        value: orderMailTotal(order, currency, common),
      },
    ],
    itemsHeading: t.itemsHeading,
    items: order.lines.map((line) =>
      orderMailItem(line, currency, common, orderLinesDifferInTax(order)),
    ),
    action: { label: t.action, path: `/admin/orders/${order.reference}` },
  };
}
