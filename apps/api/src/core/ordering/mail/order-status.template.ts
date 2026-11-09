import {
  OrderDetail,
  OrderNotice,
  type SharedOrderingText,
} from '@b2b-catalog-platform/shared/core/ordering';
import { MoneyFormat, SharedText } from '@b2b-catalog-platform/shared/platform';

import { MailContent } from '../../../platform/mail/mail-layout';
import { MailText } from '../../../platform/mail/mail-text';
import { sharedOrderingText } from '../ordering-text';
import {
  orderLinesDifferInTax,
  orderMailItem,
  orderMailTotal,
} from './order-items';
import { orderingMail, type OrderingMailText } from './ordering-mail-text';

/** The states a customer is written to about: every one a move reaches. A
 * move reaches `requested` only when the shop reopens an order; arrival is
 * the receipt's mail (FR-NOTIF-06). */
type NotifiedStatus = OrderDetail['status'];

/**
 * Which wording a message is read with. The status cannot say it alone: one
 * `approved` is an acceptance, a step back or a change a week later, hence
 * `notice`. A change that moved nothing has its own heading: this mail must
 * never announce a step not taken. `ready` reads two ways, one state.
 */
function wordingKey(
  order: OrderDetail,
  status: NotifiedStatus,
  notice: OrderNotice,
): keyof OrderingMailText['orderStatusChanged']['statuses'] {
  if (notice === 'changed') return 'changed';
  if (status === 'requested') return 'reopened';
  if (status !== 'ready') return status;
  return order.pickup ? 'readyPickup' : 'readyDelivery';
}

/** Where the order is now: the office it waits at, or the address it goes
 * to, on one line as on an envelope. */
function destination(
  order: OrderDetail,
  names: SharedOrderingText['order'],
): { label: string; value: string }[] {
  if (order.pickup) {
    return [
      {
        label: names.pickupPoint,
        value: `${order.pickup.name} · ${order.pickup.address}`,
      },
    ];
  }
  const address = order.deliveryAddress;
  if (!address) return [];
  return [
    {
      label: names.deliveryAddress,
      value: [
        address.street,
        address.street2,
        [address.postalCode, address.city].filter(Boolean).join(' '),
        address.region,
      ]
        .filter(Boolean)
        .join(', '),
    },
  ];
}

/**
 * Sent to the customer when their order moves (FR-NOTIF-03), with the order
 * as it stands, not a diff: the only place a changed order's contents are
 * announced. `changes` holds the shop's notes since the last mail
 * (FR-ORD-03), so a change and its confirmation are one mail. Links like the
 * receipt: token for a guest, order page for an account.
 */
export function orderStatusChangedMail(
  order: OrderDetail,
  status: NotifiedStatus,
  /** What this message is for: the order moved on, the shop walked it back, or
   * the shop changed it where it stood. */
  notice: OrderNotice,
  /** The capability link's token, or null where the order has an account. */
  publicToken: string | null,
  currency: MoneyFormat,
  text: MailText,
  common: SharedText,
  /** What the shop said about every change made since this customer was last
   * written to, oldest first. Empty where nothing about the order changed. */
  changes: readonly string[] = [],
  /** Whether the payment instructions travel with it (FR-ORD-05), said in the
   * body: nobody scrolls to an attachment they were not told about. */
  attached = false,
): MailContent {
  const t = orderingMail(text).orderStatusChanged;
  const names = sharedOrderingText(common).order;
  const wording = t.statuses[wordingKey(order, status, notice)];

  return {
    subject: `${t.subject} · ${order.reference}`,
    preheader: wording.heading,
    heading: wording.heading,
    // The change is said before the status is explained, because it is the
    // half the reader has not heard: the rest of the mail then describes the
    // order they are actually getting.
    paragraphs: [
      // A correction says so before it says anything else: the reader is being
      // told the order is *behind* where they last heard it was, and the
      // status sentence on its own would read as a step forward.
      ...(notice === 'corrected' ? [t.correctedIntro] : []),
      ...(changes.length ? [t.changedIntro] : []),
      wording.body,
      ...(attached ? [t.attachedNote] : []),
    ],
    rows: [
      { label: names.reference, value: order.reference },
      // Only the two refusals carry one, and both quote it: being told no
      // without being told why is the mail nobody can answer.
      ...(order.statusReason
        ? [{ label: names.reason, value: order.statusReason }]
        : []),
      // What the shop says it changed, in their own words. One row per change
      // since the last mail, so nothing said on the phone is dropped and
      // nothing already announced is repeated.
      ...changes.map((change) => ({ label: names.changeNote, value: change })),
      // Where the order goes: in the two `ready` mails, which send the reader
      // there, and in a change, which can move it. Nowhere else.
      ...(status === 'ready' || notice === 'changed'
        ? destination(order, names)
        : []),
      {
        label: names.total,
        value: orderMailTotal(order, currency, common),
      },
    ],
    itemsHeading: names.items,
    items: order.lines.map((line) =>
      orderMailItem(line, currency, common, orderLinesDifferInTax(order)),
    ),
    action: {
      label: t.action,
      path: publicToken
        ? `/orders/${publicToken}`
        : `/account/orders/${order.reference}`,
    },
  };
}
