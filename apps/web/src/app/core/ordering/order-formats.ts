import {
  CATALOG_AREA,
  type SharedCatalogText,
} from '@b2b-catalog-platform/shared/core/catalog';
import { OrderLine } from '@b2b-catalog-platform/shared/core/ordering';
import {
  fillText,
  MoneyFormat,
  SharedText,
} from '@b2b-catalog-platform/shared/platform';

import { sharedTextBlock } from '../../platform/config/shared-text';
import { formatUnitQuantity } from '../catalog/buying/quantity';

/**
 * A line's quantity as the customer reads it, which staff read too: in the
 * unit it was bought through and, for any other unit, in pieces. Both are
 * frozen with the order, so repacking a product never rewrites an order.
 */
export function customerQuantity(
  // Three fields, so a priced line reads in the same words as a placed one.
  line: Pick<OrderLine, 'unit' | 'quantity' | 'pieces'>,
  common: SharedText,
  currency: MoneyFormat,
): string {
  const qty = formatUnitQuantity(line.quantity, currency);
  const { units } = sharedTextBlock<SharedCatalogText>(common, CATALOG_AREA);
  const unit = units[line.unit];
  if (line.unit === 'piece') {
    return fillText(common.quantity, { qty, unit });
  }
  return fillText(common.quantityPieces, {
    qty,
    unit,
    pieces: formatUnitQuantity(line.pieces, currency),
    pieceUnit: units.piece,
  });
}

/**
 * The timestamp format of every order screen. Numeric (`26.08.2026, 09:15`):
 * a spelled-out month gives each a different width, and a version thread is
 * read as a column.
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
