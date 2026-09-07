import {
  formatMoneyMinor,
  MoneyFormat,
  OrderDetail,
} from '@b2b-catalog-platform/shared';
import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';
import { orderMailItem } from './order-items';

/** The states a customer is written to about: every one an order can be moved
 * to. `requested` is one of them, but never as "we have your order" — an order
 * arriving is the receipt's mail (FR-NOTIF-06), and the only way a *move* ends
 * up there is the shop reopening one it had ended. */
type NotifiedStatus = OrderDetail['status'];

/**
 * Which wording a status is read with. `ready` is the one that asks a second
 * question — the state is the same for both, and only the sentence differs
 * (ADR 0050).
 */
function wordingKey(
  order: OrderDetail,
  status: NotifiedStatus,
): keyof MailText['orderStatusChanged']['statuses'] {
  if (status === 'requested') return 'reopened';
  if (status !== 'ready') return status;
  return order.pickup ? 'readyPickup' : 'readyDelivery';
}

/**
 * Sent to the customer when their order moves (FR-NOTIF-03).
 *
 * It carries the order as it now stands, not a description of the change: a
 * customer reading it wants to know what they are getting and what happens
 * next, and an adjusted order's mail is the only place the new contents are
 * announced.
 *
 * The link follows the same rule as the receipt: a guest gets the token, an
 * account holder gets their own order page.
 */
export function orderStatusChangedMail(
  order: OrderDetail,
  status: NotifiedStatus,
  /** The capability link's token, or null where the order has an account. */
  publicToken: string | null,
  currency: MoneyFormat,
  text: MailText,
): MailContent {
  const t = text.orderStatusChanged;
  const wording = t.statuses[wordingKey(order, status)];

  return {
    subject: `${t.subject} · ${order.reference}`,
    preheader: wording.heading,
    heading: wording.heading,
    paragraphs: [wording.body],
    rows: [
      { label: t.referenceLabel, value: order.reference },
      // Only the two refusals carry one, and both quote it: being told no
      // without being told why is the mail nobody can answer.
      ...(order.statusReason
        ? [{ label: t.reasonLabel, value: order.statusReason }]
        : []),
      {
        label: t.totalLabel,
        value: formatMoneyMinor(order.totalMinor, currency),
      },
    ],
    itemsHeading: t.itemsHeading,
    items: order.lines.map((line) => orderMailItem(line, currency, text)),
    action: {
      label: t.action,
      path: publicToken
        ? `/orders/${publicToken}`
        : `/account/orders/${order.reference}`,
    },
  };
}
