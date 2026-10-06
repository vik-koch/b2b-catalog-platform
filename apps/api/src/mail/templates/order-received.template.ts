import {
  fillText,
  MoneyFormat,
  OrderDetail,
} from '@b2b-catalog-platform/shared';
import { shopDay } from '../../orders/shop-day';
import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';
import {
  orderLinesDifferInTax,
  orderMailItem,
  orderMailTotal,
} from './order-items';

/**
 * Sent to whoever placed an order request (FR-NOTIF-06).
 *
 * A receipt for a *request*, never a confirmation of a sale: nothing is charged
 * and nothing is dispatched until a manager answers it, and the wording says
 * so.
 *
 * Where the action leads depends on who ordered. A guest gets the token link —
 * they have no account to read the order from, and it is their only record of
 * what they sent. Somebody with an account gets their own order page instead:
 * mailing them a capability URL to something they can already open signed in
 * would put a shareable, unauthenticated link to their order in an inbox for
 * no reason, and land them on a page written for a stranger.
 */
export function orderReceivedMail(
  order: OrderDetail,
  /** The capability link's token, or null where the order has an account. */
  publicToken: string | null,
  currency: MoneyFormat,
  text: MailText,
  /** The shop's timezone, which the terms' date is read in. */
  timeZone: string,
): MailContent {
  const t = text.orderReceived;

  return {
    subject: `${t.subject} · ${order.reference}`,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [
      t.body.split('{reference}').join(order.reference),
      t.nextSteps,
    ],
    rows: [
      { label: t.referenceLabel, value: order.reference },
      {
        label: t.fulfilmentLabel,
        value: order.pickup ? t.pickup : t.delivery,
      },
      {
        label: t.totalLabel,
        value: orderMailTotal(order, currency, text),
      },
      ...(order.termsDate
        ? [
            {
              label: t.termsLabel,
              value: fillText(t.termsVersion, {
                date: shopDay(order.termsDate, currency.locale, timeZone),
              }),
            },
          ]
        : []),
    ],
    itemsHeading: t.itemsHeading,
    items: order.lines.map((line) =>
      orderMailItem(line, currency, text, orderLinesDifferInTax(order)),
    ),
    action: {
      label: t.action,
      path: publicToken
        ? `/orders/${publicToken}`
        : `/account/orders/${order.reference}`,
    },
  };
}
