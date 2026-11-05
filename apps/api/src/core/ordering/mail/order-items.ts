import {
  SharedText,
  fillText,
  formatMoneyMinor,
  formatTaxRate,
  MoneyFormat,
  sharedTaxRate,
} from '@b2b-catalog-platform/shared/platform';
import { OrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import { MailItem } from '../../../platform/mail/mail-layout';
import {
  CATALOG_AREA,
  type SharedCatalogText,
} from '@b2b-catalog-platform/shared/core/catalog';
import { sharedTextBlock } from '../../../platform/config/shared-text';

/** A line as both order mails state it, from the order's copies: the unit it
 * was bought in, and its pieces where that is no piece. A mail is read months
 * later beside the goods, maybe after a repack. */
export function orderMailItem(
  line: OrderDetail['lines'][number],
  currency: MoneyFormat,
  common: SharedText,
  /** Whether the order's lines differ in rate, so each states its own. */
  perLineTax = false,
): MailItem {
  const { units } = sharedTextBlock<SharedCatalogText>(common, CATALOG_AREA);
  const quantity =
    line.unit === 'piece'
      ? fillText(common.quantity, {
          qty: line.quantity,
          unit: units.piece,
        })
      : fillText(common.quantityPieces, {
          qty: line.quantity,
          unit: units[line.unit],
          pieces: line.pieces,
          pieceUnit: units.piece,
        });

  const rate = perLineTax ? orderLineTax(line, currency.locale, common) : null;

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

/** The order's tax basis under the total (NFR-LEGAL-11): the lines' shared
 * rate, or the basis alone once they differ. Never a figure: the invoice
 * states the tax. */
export function orderTaxStatement(
  order: OrderDetail,
  locale: string | undefined,
  common: SharedText,
): string {
  const tax = common.tax;
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
  common: SharedText,
): string | null {
  return line.taxRate === null
    ? null
    : fillText(common.tax.line, {
        rate: formatTaxRate(line.taxRate, locale),
      });
}

/** The total as an order mail states it, with the basis after it. */
export function orderMailTotal(
  order: OrderDetail,
  currency: MoneyFormat,
  common: SharedText,
): string {
  const total = formatMoneyMinor(order.totalMinor, currency);
  return `${total} · ${orderTaxStatement(order, currency.locale, common)}`;
}
