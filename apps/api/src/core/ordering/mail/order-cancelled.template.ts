import { AdminOrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import { MoneyFormat, SharedText } from '@b2b-catalog-platform/shared/platform';

import { MailContent } from '../../../platform/mail/mail-layout';
import { MailText } from '../../../platform/mail/mail-text';
import { sharedOrderingText } from '../ordering-text';
import {
  orderLinesDifferInTax,
  orderMailItem,
  orderMailTotal,
} from './order-items';
import { orderingMail } from './ordering-mail-text';

/** Sent to the shop when a customer calls their order off (FR-NOTIF-07): a
 * manager must not learn late that the order they pack is unwanted. With the
 * reason where one was given (FR-ORD-02) and the lines, which go back on the
 * shelf. */
export function orderCancelledMail(
  order: AdminOrderDetail,
  currency: MoneyFormat,
  text: MailText,
  common: SharedText,
): MailContent {
  const t = orderingMail(text).orderCancelled;
  const names = sharedOrderingText(common).order;

  return {
    subject: `${t.subject} · ${order.reference}`,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [
      t.body,
      // Money held on an order now off. A refund happens in the shop's books,
      // so this sentence is the whole prompt.
      ...(order.paymentState === 'paid' ? [t.paidNote] : []),
    ],
    rows: [
      { label: names.reference, value: order.reference },
      {
        label: orderingMail(text).orders.account,
        value: order.customerEmail ?? orderingMail(text).orders.guest,
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
