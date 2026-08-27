import {
  formatMoneyMinor,
  MoneyFormat,
  OrderDetail,
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
): MailItem {
  const units = text.common.units;
  const quantity =
    line.unit === 'piece'
      ? fill(text.common.quantity, {
          qty: line.quantity,
          unit: units.piece,
        })
      : fill(text.common.quantityPieces, {
          qty: line.quantity,
          unit: units[line.unit],
          pieces: line.pieces,
          pieceUnit: units.piece,
        });

  return {
    name: line.name,
    quantity,
    ...(line.note ? { note: line.note } : {}),
    total: formatMoneyMinor(line.lineTotalMinor, currency),
  };
}

/** The same `{placeholder}` substitution the frontend's app text uses. */
function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
    template,
  );
}
