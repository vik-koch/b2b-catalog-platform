import { sharedOrderingText } from '../ordering-text';
import { orderingMail } from './ordering-mail-text';
import { SharedText, MoneyFormat } from '@b2b-catalog-platform/shared/platform';
import {
  OrderDetail,
  OrderDocumentKind,
} from '@b2b-catalog-platform/shared/core/ordering';
import { orderMailTotal } from './order-items';
import { MailContent } from '../../../platform/mail/mail-layout';
import { MailText } from '../../../platform/mail/mail-text';

/** The mail a supplied document sends (FR-ORD-05). Not a status mail: no
 * step was taken, a file arrived, most often the payment details. No lines:
 * the order is unchanged and a click away. */
export function orderDocumentMail(
  order: OrderDetail,
  kind: OrderDocumentKind,
  publicToken: string | null,
  currency: MoneyFormat,
  text: MailText,
  common: SharedText,
): MailContent {
  const t = orderingMail(text).orderDocument;
  const names = sharedOrderingText(common).order;
  const wording =
    kind === 'payment-instructions'
      ? t.kinds.paymentInstructions
      : t.kinds.orderSummary;

  return {
    subject: `${t.subject} · ${order.reference}`,
    preheader: wording.heading,
    heading: wording.heading,
    paragraphs: [wording.body],
    rows: [
      { label: names.reference, value: order.reference },
      {
        label: names.total,
        value: orderMailTotal(order, currency, common),
      },
    ],
    action: {
      label: t.action,
      path: publicToken
        ? `/orders/${publicToken}`
        : `/account/orders/${order.reference}`,
    },
  };
}
