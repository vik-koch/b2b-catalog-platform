import { OrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import {
  fillText,
  MoneyFormat,
  SharedText,
  shopDay,
} from '@b2b-catalog-platform/shared/platform';

import { MailContent } from '../../../platform/mail/mail-layout';
import { MailText } from '../../../platform/mail/mail-text';
import { sharedOrderingText } from '../ordering-text';
import {
  orderLinesDifferInTax,
  orderMailItem,
  orderMailTotal,
} from './order-items';
import { orderingMail } from './ordering-mail-text';

/**
 * Sent to whoever placed an order request (FR-NOTIF-06): a receipt for a
 * request, not a sale. A guest gets the token link, their only record; an
 * account holder gets their order page, as a shareable link in an inbox would
 * serve nothing and lead to a page written for a stranger.
 */
export function orderReceivedMail(
  order: OrderDetail,
  /** The capability link's token, or null where the order has an account. */
  publicToken: string | null,
  currency: MoneyFormat,
  text: MailText,
  common: SharedText,
  /** The shop's timezone, which the terms' date is read in. */
  timeZone: string,
): MailContent {
  const t = orderingMail(text).orderReceived;
  const names = sharedOrderingText(common).order;

  return {
    subject: `${t.subject} · ${order.reference}`,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [
      t.body.split('{reference}').join(order.reference),
      t.nextSteps,
    ],
    rows: [
      { label: names.reference, value: order.reference },
      {
        label: sharedOrderingText(common).fulfilment.label,
        value: order.pickup
          ? sharedOrderingText(common).fulfilment.pickup
          : sharedOrderingText(common).fulfilment.delivery,
      },
      {
        label: names.total,
        value: orderMailTotal(order, currency, common),
      },
      ...(order.termsDate
        ? [
            {
              label: common.nav.terms,
              value: fillText(names.termsVersion, {
                date: shopDay(order.termsDate, currency.locale, timeZone),
              }),
            },
          ]
        : []),
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
