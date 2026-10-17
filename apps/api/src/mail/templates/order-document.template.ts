import {
  CommonText,
  MoneyFormat,
  OrderDetail,
  OrderDocumentKind,
} from '@b2b-catalog-platform/shared';
import { orderMailTotal } from './order-items';
import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * The message a supplied document sends on its own (FR-ORD-05, ADR 0052).
 *
 * Its own template rather than a variant of the status mail, because it
 * announces no step: nothing about the order moved, and nothing it says
 * changed. What happened is that a file the shop owed the customer arrived —
 * most often the payment details for an order that was confirmed before they
 * existed.
 *
 * Short by design. It carries no line items: the order it belongs to is one
 * click away and has not changed, and a mail that restated it would invite the
 * reader to compare two copies of the same thing.
 */
export function orderDocumentMail(
  order: OrderDetail,
  kind: OrderDocumentKind,
  publicToken: string | null,
  currency: MoneyFormat,
  text: MailText,
  common: CommonText,
): MailContent {
  const t = text.orderDocument;
  const names = common.order;
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
