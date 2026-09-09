import { fillText, OrderLine } from '@b2b-catalog-platform/shared';
import { formatUnitQuantity } from '../catalog/quantity';
import { CurrencyConfig } from '../catalog/price';
import { AppText } from '../config/app-text.type';
import { OrderBlockLabels } from './order-blocks';

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
  line: OrderLine,
  text: AppText,
  currency: CurrencyConfig,
): string {
  const review = text.checkout.review;
  const qty = formatUnitQuantity(line.quantity, currency);
  const unit = text.catalog.units[line.unit];
  if (line.unit === 'piece') {
    return fillText(review.quantity, { qty, unit });
  }
  return fillText(review.quantityPieces, {
    qty,
    unit,
    pieces: formatUnitQuantity(line.pieces, currency),
    pieceUnit: text.catalog.units.piece,
  });
}

/** The headings the customer reads an order's answers under — the checkout's
 * own questions, which is what makes an order read the same before and after
 * it was sent. */
export function customerBlockLabels(text: AppText): OrderBlockLabels {
  const checkout = text.checkout;
  const review = checkout.review;
  return {
    fulfilment: review.fulfilment,
    delivery: checkout.fulfilment.deliveryTitle,
    pickup: checkout.fulfilment.pickupTitle,
    invoice: review.invoice,
    billingSame: review.billingSame,
    deliveryDate: checkout.timing.deliveryLabel,
    pickupDate: checkout.timing.pickupLabel,
    whenAny: review.whenAny,
    payment: review.payment,
    cash: checkout.payment.cashTitle,
    card: checkout.payment.cardTitle,
    transfer: checkout.payment.transferTitle,
    contact: text.orders.detail.contact,
    note: review.note,
  };
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
