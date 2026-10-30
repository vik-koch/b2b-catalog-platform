import {
  SharedText,
  fillText,
  OrderLine,
  MoneyFormat,
} from '@b2b-catalog-platform/shared';
import { formatUnitQuantity } from '../../core/catalog/buying/quantity';

/**
 * How an order reads to the customer it belongs to.
 *
 * Extracted because staff read it too: a manager checking what the shop sent
 * on Tuesday is asking what the customer is looking at, and a second rendering
 * of the same version would be a second opinion about it. The customer's own
 * page and the staff screen that reads a version back both come through here,
 * so the two cannot drift.
 */

/**
 * The quantity in the unit the line was bought through and, where that is not
 * the piece, what it came to in pieces — both frozen with the order, so
 * repacking the product never rewrites what somebody ordered.
 */
export function customerQuantity(
  // Only the three fields a quantity is read from, so a screen holding a
  // priced line rather than a placed one reads it in the same words.
  line: Pick<OrderLine, 'unit' | 'quantity' | 'pieces'>,
  common: SharedText,
  currency: MoneyFormat,
): string {
  const qty = formatUnitQuantity(line.quantity, currency);
  const unit = common.units[line.unit];
  if (line.unit === 'piece') {
    return fillText(common.quantity, { qty, unit });
  }
  return fillText(common.quantityPieces, {
    qty,
    unit,
    pieces: formatUnitQuantity(line.pieces, currency),
    pieceUnit: common.units.piece,
  });
}

/**
 * The one clock every order screen reads.
 *
 * Numeric and short — `26.08.2026, 09:15` in a locale that writes days first —
 * because these are timestamps a manager scans down a column and compares, not
 * dates in a sentence. A spelled-out month sets each of them at a different
 * width and turns a version thread into a column nobody can line up.
 */
export function orderDateTimeFormat(locale: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
