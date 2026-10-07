import {
  fillText,
  formatMoneyMinor,
  formatTaxRate,
  MoneyFormat,
  OrderDetail,
  sharedTaxRate,
} from '@b2b-catalog-platform/shared';
import { MailItem } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * A line as both order mails state it, from the order's own snapshots: the
 * reading it was bought through, and — where that is not the piece — what it
 * came to in pieces. A mail is read months later, beside goods somebody is
 * counting, and the product may have been repacked since.
 */
export function orderMailItem(
  line: OrderDetail['lines'][number],
  currency: MoneyFormat,
  text: MailText,
  /** Whether the order's lines differ in rate, so each states its own. */
  perLineTax = false,
): MailItem {
  const units = text.common.units;
  const quantity =
    line.unit === 'piece'
      ? fillText(text.common.quantity, {
          qty: line.quantity,
          unit: units.piece,
        })
      : fillText(text.common.quantityPieces, {
          qty: line.quantity,
          unit: units[line.unit],
          pieces: line.pieces,
          pieceUnit: units.piece,
        });

  const rate = perLineTax ? orderLineTax(line, currency.locale, text) : null;

  return {
    name: line.name,
    // Beside the quantity rather than in a column of its own: the layout is
    // shared with every other mail, and the rate qualifies this line only.
    quantity: rate ? `${quantity} · ${rate}` : quantity,
    ...(line.note ? { note: line.note } : {}),
    total: formatMoneyMinor(line.lineTotalMinor, currency),
  };
}

/** Whether an order's lines state their own rates: only once they differ. */
export function orderLinesDifferInTax(order: OrderDetail): boolean {
  return (
    order.taxBasis !== 'none' &&
    sharedTaxRate(order.lines.map((line) => line.taxRate)) === null
  );
}

/**
 * The tax basis the order was submitted under, as a mail or the order summary
 * states it under the total (NFR-LEGAL-11): the rate the lines share, or only
 * the basis once they differ. A statement, never a figure — the shop's invoice
 * states the tax.
 */
export function orderTaxStatement(
  order: OrderDetail,
  locale: string | undefined,
  text: MailText,
): string {
  const tax = text.common.tax;
  if (order.taxBasis === 'none') return tax.none;
  const shared = sharedTaxRate(order.lines.map((line) => line.taxRate));
  return shared === null || shared === undefined
    ? tax.mixed[order.taxBasis]
    : fillText(tax[order.taxBasis], { rate: formatTaxRate(shared, locale) });
}

/** One line's rate, as a mail or the order summary states it. */
export function orderLineTax(
  line: OrderDetail['lines'][number],
  locale: string | undefined,
  text: MailText,
): string | null {
  return line.taxRate === null
    ? null
    : fillText(text.common.tax.line, {
        rate: formatTaxRate(line.taxRate, locale),
      });
}

/** The total as an order mail states it, with the basis after it. */
export function orderMailTotal(
  order: OrderDetail,
  currency: MoneyFormat,
  text: MailText,
): string {
  const total = formatMoneyMinor(order.totalMinor, currency);
  return `${total} · ${orderTaxStatement(order, currency.locale, text)}`;
}
