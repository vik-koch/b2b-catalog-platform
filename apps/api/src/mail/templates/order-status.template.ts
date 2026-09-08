import {
  formatMoneyMinor,
  MoneyFormat,
  OrderDetail,
  OrderNotice,
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
 * Which wording a message is read with.
 *
 * The status alone cannot answer it, which is why `notice` exists: the same
 * `approved` is the shop accepting an order, walking a packed one back a step,
 * or changing one it accepted a week ago, and those are three different pieces
 * of news. A change that moved nothing gets a heading of its own — announcing
 * a step the order did not take is the one thing this mail must never do.
 *
 * `ready` is the one status that asks a second question: the state is the same
 * for both, and only the sentence differs (ADR 0050).
 */
function wordingKey(
  order: OrderDetail,
  status: NotifiedStatus,
  notice: OrderNotice,
): keyof MailText['orderStatusChanged']['statuses'] {
  if (notice === 'changed') return 'changed';
  if (status === 'requested') return 'reopened';
  if (status !== 'ready') return status;
  return order.pickup ? 'readyPickup' : 'readyDelivery';
}

/**
 * Where the order is now — the office it is waiting at, or the address it is
 * on its way to. One line, because a mail row is one line: the address reads
 * the way it is written on an envelope, comma-separated.
 */
function destination(
  order: OrderDetail,
  t: MailText['orderStatusChanged'],
): { label: string; value: string }[] {
  if (order.pickup) {
    return [
      {
        label: t.pickupLabel,
        value: `${order.pickup.name} · ${order.pickup.address}`,
      },
    ];
  }
  const address = order.deliveryAddress;
  if (!address) return [];
  return [
    {
      label: t.deliveryLabel,
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
 * Sent to the customer when their order moves (FR-NOTIF-03).
 *
 * It carries the order as it now stands, not a diff: a customer reading it
 * wants to know what they are getting and what happens next, and this mail is
 * the only place the contents of a changed order are announced.
 *
 * `changes` is what the shop said about every change written since this
 * customer was last written to (FR-ORD-03) — usually one sentence agreed on
 * the phone, sometimes none at all. One mail covers the lot: a change and the
 * confirmation that followed it are one piece of news, and the shop is not in
 * the business of mailing somebody twice about one conversation.
 *
 * The link follows the same rule as the receipt: a guest gets the token, an
 * account holder gets their own order page.
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
  /** What the shop said about every change made since this customer was last
   * written to, oldest first. Empty where nothing about the order changed. */
  changes: readonly string[] = [],
): MailContent {
  const t = text.orderStatusChanged;
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
    ],
    rows: [
      { label: t.referenceLabel, value: order.reference },
      // Only the two refusals carry one, and both quote it: being told no
      // without being told why is the mail nobody can answer.
      ...(order.statusReason
        ? [{ label: t.reasonLabel, value: order.statusReason }]
        : []),
      // What the shop says it changed, in their own words. One row per change
      // since the last mail, so nothing said on the phone is dropped and
      // nothing already announced is repeated.
      ...changes.map((change) => ({ label: t.changedLabel, value: change })),
      // The two `ready` mails send the reader somewhere, so they say where —
      // and so does a message about a change, since where the order goes is
      // one of the things an adjustment can change. Nowhere else: a status
      // mail repeating the address back would answer a question nobody asked.
      ...(status === 'ready' || notice === 'changed'
        ? destination(order, t)
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
