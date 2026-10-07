import { AdminOrderDetail, MoneyFormat } from '@b2b-catalog-platform/shared';
import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';
import { orderMailItem, orderMailTotal } from './order-items';

/**
 * Sent to the shop when an order request arrives (FR-NOTIF-05). Staff are the
 * only ones who can answer it, so this is the mail that links into the admin
 * order view.
 *
 * It repeats what a manager decides on before opening anything: who it is for,
 * who to ring, how it should arrive and what it comes to — the same reasoning
 * as the registration notification, which is read on a phone.
 */
export function newOrderMail(
  order: AdminOrderDetail,
  currency: MoneyFormat,
  text: MailText,
): MailContent {
  const t = text.newOrder;
  const party = order.party.registrationId
    ? `${order.party.name} · ${order.party.registrationId}`
    : order.party.name;

  return {
    subject: `${t.subject} · ${order.reference}`,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [
      { label: t.referenceLabel, value: order.reference },
      // A guest order says so rather than leaving the row blank: "no account"
      // is a fact about the order, and it decides how the price was quoted.
      { label: t.customerLabel, value: order.customerEmail ?? t.guest },
      {
        // Name, phone, address — all three, in the order a manager uses them.
        // The address is not repeated from the account row: a guest order has
        // no account, and then this is the only way back to the customer.
        label: t.contactLabel,
        value: [
          order.contact.name,
          order.contact.phone,
          order.contact.email,
        ].join(' · '),
      },
      { label: t.partyLabel, value: party },
      {
        label: t.fulfilmentLabel,
        value: order.pickup ? `${t.pickup} · ${order.pickup.name}` : t.delivery,
      },
      {
        label: t.paymentLabel,
        value: {
          'bank-transfer': t.transfer,
          'card-later': t.card,
          cash: t.cash,
        }[order.paymentMethod],
      },
      {
        label: t.totalLabel,
        value: orderMailTotal(order, currency, text),
      },
    ],
    itemsHeading: t.itemsHeading,
    // Staff read every line's rate, shared or not: it is what a line
    // reconciles against the shop's own invoice by.
    items: order.lines.map((line) =>
      orderMailItem(line, currency, text, order.taxBasis !== 'none'),
    ),
    action: { label: t.action, path: `/admin/orders/${order.reference}` },
  };
}
