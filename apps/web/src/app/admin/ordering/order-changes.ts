import {
  SharedText,
  MoneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared';
import { OrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import {
  orderBlocks,
  OrderBlockConfig,
  OrderBlockLabels,
} from '../../core/ordering/order-blocks';
import { formatStoredDecimal } from '../../core/catalog/buying/quantity';
import { customerQuantity } from '../../core/ordering/order-formats';
import { OrderChange } from './ui/order-adjust-changes';

/** The change list's own words; the rest is the order's vocabulary. */
export interface OrderChangeLabels {
  readonly line: string;
  readonly added: string;
  readonly removed: string;
  readonly total: string;
  /** The estimate's label, where the products allow one. */
  readonly shipment: string;
}

/** Money format and packing units. */
export interface OrderChangeConfig extends OrderBlockConfig {
  readonly currency: MoneyFormat;
  readonly boxUnits: { readonly volume: string; readonly weight: string };
}

/** Without the documents: they belong to the order, not a version. */
type ComparedOrder = Omit<OrderDetail, 'documents'>;

/**
 * What differs between two versions of an order (FR-ORD-03). Both sides go
 * through `orderBlocks` and compare as text, so a difference is in the order,
 * never in its phrasing. Lines match by slug; their order is not compared, as
 * reordering changes nothing bought and must not be mailed about.
 */
export function orderChanges(
  before: ComparedOrder,
  after: ComparedOrder,
  labels: OrderChangeLabels,
  common: SharedText,
  blockLabels: OrderBlockLabels,
  config: OrderChangeConfig,
): OrderChange[] {
  return [
    ...orderLineChanges(before, after, labels, common, config),
    ...orderBlockChanges(before, after, blockLabels, config),
  ];
}

/** Lines, total and pallet: the half that needs pricing. The blocks compare
 * from the form alone, so edits show while a number is half-typed. */
export function orderLineChanges(
  before: ComparedOrder,
  after: ComparedOrder,
  labels: OrderChangeLabels,
  common: SharedText,
  config: OrderChangeConfig,
): OrderChange[] {
  const { currency } = config;
  const changes: OrderChange[] = [];
  // The customer's reading of the quantity, as the rest of the order.
  const line = (entry: OrderDetail['lines'][number]) =>
    `${customerQuantity(entry, common, currency)} · ${formatMoneyMinor(entry.lineTotalMinor, currency)}`;

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
      before: formatMoneyMinor(before.totalMinor, currency),
      after: formatMoneyMinor(after.totalMinor, currency),
    });
  }

  // Derived, but a real change: two boxes fewer is a different van.
  const wasShipment = shipmentText(before, config);
  const isShipment = shipmentText(after, config);
  if (wasShipment !== isShipment) {
    changes.push({
      label: labels.shipment,
      before: wasShipment,
      after: isShipment,
    });
  }
  return changes;
}

/** The blocks, paired by position: both sides come from the same function. */
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

/** The packing estimate as one line, or null. An approximate one says so: exact
 * to a guess is a change. */
function shipmentText(
  order: ComparedOrder,
  { boxUnits, currency }: OrderChangeConfig,
): string | null {
  const { weight, volume, approximate } = order.shipment;
  const parts = [
    weight === null
      ? null
      : `${formatStoredDecimal(weight, currency)} ${boxUnits.weight}`,
    volume === null
      ? null
      : `${formatStoredDecimal(volume, currency)} ${boxUnits.volume}`,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  return approximate ? `≈ ${parts.join(' · ')}` : parts.join(' · ');
}
