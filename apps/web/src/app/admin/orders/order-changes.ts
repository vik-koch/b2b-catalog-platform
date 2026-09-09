import { OrderDetail } from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../../catalog/price';
import {
  orderBlocks,
  OrderBlockConfig,
  OrderBlockLabels,
} from '../../orders/order-blocks';
import { OrderChange } from './order-adjust-changes';

/** The words a change list needs of its own. Everything else it says comes
 * from the order's own vocabulary. */
export interface OrderChangeLabels {
  readonly line: string;
  readonly added: string;
  readonly removed: string;
  readonly total: string;
  /** What the order is estimated to weigh and take up, where the products say
   * enough for it to be estimated at all. */
  readonly shipment: string;
}

/**
 * What is different between two versions of an order (FR-ORD-03) — the one on
 * file and the one a manager is proposing, or two versions already written.
 *
 * Both sides are put through the **same** wording the order is read in
 * everywhere else (`orderBlocks`) and compared as text. That is the whole
 * trick: a difference here is a difference in the order and never a difference
 * in how one of the two was phrased, and nothing has to be taught separately
 * that a pickup point and a delivery address are the same question.
 *
 * Lines are matched by slug, because that is what a line *is* — a product in
 * an order. Two lines of one product cannot exist, so nothing has to decide
 * which of them moved. Their *order* is not compared: moving a line up the
 * page changes how the order reads on a picking list and changes nothing about
 * what was bought, so reporting it as a change would fill the list with rows
 * the customer must not be mailed about.
 */
/** Two readings of an order, as this compares them. Without the documents:
 * they belong to the order rather than to either version, so a difference
 * between two versions can never be one. */
type ComparedOrder = Omit<OrderDetail, 'documents'>;

export function orderChanges(
  before: ComparedOrder,
  after: ComparedOrder,
  labels: OrderChangeLabels,
  blockLabels: OrderBlockLabels,
  config: OrderBlockConfig,
  currency: Parameters<typeof formatPriceMinor>[1],
): OrderChange[] {
  return [
    ...orderLineChanges(before, after, labels, currency),
    ...orderBlockChanges(before, after, blockLabels, config),
  ];
}

/**
 * The half of the comparison that is about what was bought: the lines, the
 * total, and what it comes to on a pallet.
 *
 * Its own function because it is the half that needs an order to have been
 * priced. A screen comparing a draft against the version on file can answer
 * the other half from the form alone, and should — an address corrected while
 * a company number is half-typed is still a change, and a comparison that
 * refuses to say so reports a form full of edits as an empty one.
 */
export function orderLineChanges(
  before: ComparedOrder,
  after: ComparedOrder,
  labels: OrderChangeLabels,
  currency: Parameters<typeof formatPriceMinor>[1],
): OrderChange[] {
  const changes: OrderChange[] = [];
  const line = (entry: OrderDetail['lines'][number]) =>
    `${entry.quantity} ${entry.unit} · ${formatPriceMinor(entry.lineTotalMinor, currency)}`;

  const was = new Map(before.lines.map((entry) => [entry.slug, entry]));
  const is = new Map(after.lines.map((entry) => [entry.slug, entry]));

  for (const [slug, entry] of was) {
    const now = is.get(slug);
    if (!now) {
      changes.push({
        label: `${labels.removed}: ${entry.name}`,
        before: line(entry),
        after: null,
      });
    } else if (line(entry) !== line(now)) {
      changes.push({
        label: `${labels.line}: ${entry.name}`,
        before: line(entry),
        after: line(now),
      });
    }
  }
  for (const [slug, entry] of is) {
    if (was.has(slug)) continue;
    changes.push({
      label: `${labels.added}: ${entry.name}`,
      before: null,
      after: line(entry),
    });
  }

  if (before.totalMinor !== after.totalMinor) {
    changes.push({
      label: labels.total,
      before: formatPriceMinor(before.totalMinor, currency),
      after: formatPriceMinor(after.totalMinor, currency),
    });
  }

  // What it comes to on a pallet. Derived rather than typed, but a real change
  // to the order all the same: two boxes fewer is a different van, and the
  // shop reads this figure before it books one.
  const wasShipment = shipmentText(before);
  const isShipment = shipmentText(after);
  if (wasShipment !== isShipment) {
    changes.push({
      label: labels.shipment,
      before: wasShipment,
      after: isShipment,
    });
  }
  return changes;
}

/**
 * The other half: every block the order describes itself in.
 *
 * Block by block, in the order the checkout asked its questions. Paired by
 * position rather than by heading: the blocks are built from the same function
 * on both sides, so they arrive in the same order, and a heading that is not
 * there on one side is a block the other side dropped.
 */
export function orderBlockChanges(
  before: ComparedOrder,
  after: ComparedOrder,
  blockLabels: OrderBlockLabels,
  config: OrderBlockConfig,
): OrderChange[] {
  const changes: OrderChange[] = [];
  const wasBlocks = orderBlocks(before, blockLabels, config);
  const isBlocks = orderBlocks(after, blockLabels, config);
  for (const [index, block] of wasBlocks.entries()) {
    const now = isBlocks[index];
    const wasText = block.lines.join(' · ');
    const isText = now?.lines.join(' · ') ?? '';
    if (!now || wasText === isText) continue;
    changes.push({ label: block.heading, before: wasText, after: isText });
  }
  return changes;
}

/**
 * The packing estimate as one line, or null where the products carry too
 * little to estimate from. An approximate figure says so: a change from an
 * exact estimate to a guess is itself worth seeing.
 */
function shipmentText(order: ComparedOrder): string | null {
  const { weight, volume, approximate } = order.shipment;
  const parts = [
    weight === null ? null : `${weight} kg`,
    volume === null ? null : `${volume} m³`,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  return approximate ? `≈ ${parts.join(' · ')}` : parts.join(' · ');
}
