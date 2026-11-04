import {
  OrderAddress,
  OrderStatus,
  OrderSubmission,
  OrderSummary,
  PaymentState,
  StaffOrderSort,
  OrderContact,
  OrderingParty,
} from '@b2b-catalog-platform/shared/core/ordering';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { asc, desc, getTableColumns, sql, SQL } from 'drizzle-orm';
import { PricedAdjustment } from './order-adjustment';
import { alias, PgColumn } from 'drizzle-orm/pg-core';
import { AddressInput } from '@b2b-catalog-platform/shared/core/accounts';
import { PickupLocation } from '../../platform/config/deployment-config';
import {
  orderItems,
  orderRevisions,
  orders,
  pageVersions,
} from '../../platform/db/schema';

/** The snapshot columns of a version, without its bookkeeping. */
const {
  id: _revisionId,
  orderId: _revisionOrderId,
  createdAt: _revisionCreatedAt,
  createdBy: _revisionCreatedBy,
  note: _revisionNote,
  kind: _revisionKind,
  notifiedAt: _revisionNotifiedAt,
  revisionNumber: _revisionNumber,
  ...snapshotColumns
} = getTableColumns(orderRevisions);

/** The version the customer is being shown, joined beside the one staff are:
 * how far behind their view is, and where they last heard the order stood. */
export const customerRevision = alias(orderRevisions, 'customerRevision');

/** The terms version the order accepted on submission. */
export const acceptedTerms = alias(pageVersions, 'acceptedTerms');

/**
 * An order and one of its versions as one flat row (ADR 0051). The version's
 * `status` and `statusReason` come last and win, so a customer can be shown a
 * version the order has moved past; queries filter on `orders.status`.
 */
export const orderColumns = {
  ...getTableColumns(orders),
  ...snapshotColumns,
  revisionId: orderRevisions.id,
  revisionNumber: orderRevisions.revisionNumber,
  revisionNote: orderRevisions.note,
  revisionKind: orderRevisions.kind,
  revisionCreatedAt: orderRevisions.createdAt,
  revisionCreatedBy: orderRevisions.createdBy,
  revisionNotifiedAt: orderRevisions.notifiedAt,
  customerRevisionNumber: customerRevision.revisionNumber,
  termsVersion: acceptedTerms.version,
  termsDate: acceptedTerms.createdAt,
};

export type OrderRow = typeof orders.$inferSelect &
  Omit<
    typeof orderRevisions.$inferSelect,
    | 'id'
    | 'orderId'
    | 'createdAt'
    | 'createdBy'
    | 'note'
    | 'kind'
    | 'notifiedAt'
    | 'revisionNumber'
  > & {
    revisionId: string;
    revisionNumber: number;
    revisionNote: string | null;
    revisionKind: string;
    revisionCreatedAt: Date;
    revisionCreatedBy: string | null;
    revisionNotifiedAt: Date | null;
    customerRevisionNumber: number | null;
    termsVersion: number | null;
    termsDate: Date | null;
  };
export type OrderItemRow = typeof orderItems.$inferSelect;

/** What the thread says about the customer, read once per order. */
export interface CustomerThread {
  /** The newest version a message went out about, 0 if none ever did. */
  number: number;
  /** Which states those messages announced, in no particular order. */
  statuses: OrderStatus[];
  /** The newest version that changed what the order says, 0 if none did. */
  newestChange: number;
}

/** The columns a version carries forward unchanged when the order moves but
 * says nothing new — everything except the version's own bookkeeping. */
export type OrderSnapshot = Omit<
  typeof orderRevisions.$inferInsert,
  | 'id'
  | 'orderId'
  | 'revisionNumber'
  | 'createdAt'
  | 'createdBy'
  | 'kind'
  | 'note'
  | 'notifiedAt'
  | 'status'
  | 'statusReason'
>;

/** The one 404 the order routes answer with. Another customer's order is a 404
 * as well: whether a reference exists is not a stranger's business. */
export const notFound = () =>
  new NotFoundException({
    code: 'order-not-found',
    message: 'Order not found',
  });

/**
 * Removed personal details (NFR-LEGAL-14) end an order for good: no moves, no
 * mail to the placeholder address. Recording money stays possible.
 */
export function refuseIfDetailsRemoved(row: OrderRow): void {
  if (row.personalDataRemovedAt) {
    throw new ConflictException({
      code: 'personal-data-removed',
      message: "This order's personal details were removed",
    });
  }
}

/** Two people writing one order at once. Whichever of the two guards catches
 * it — the version number or the pointer — the loser is told the same thing. */
export const orderMovedOn = () =>
  new ConflictException({
    code: 'order-changed',
    message: 'The order was adjusted while this one was being written',
  });

/**
 * Where an order goes, who is invoiced and how it is paid: what checkout and
 * adjustment both carry and are both held to.
 */
export type OrderDetails = Pick<
  OrderSubmission,
  | 'fulfilmentMethod'
  | 'deliveryAddress'
  | 'pickupLocationKey'
  | 'billingAddress'
  | 'paymentMethod'
>;

/** Where an order goes: an address with the zone it fell into, or an office. */
export interface Fulfilment {
  address: AddressInput | null;
  zone: { key: string; freeFromMinor: number | null } | null;
  pickup: PickupLocation | null;
}

/**
 * The staff list's order (FR-AUTH-03): unanswered first by default, newest
 * first within a group. The reference closes every sort, so equal timestamps
 * cannot swap pages.
 */
export function orderListOrderBy(sort: StaffOrderSort): (SQL | PgColumn)[] {
  const newest = [desc(orders.createdAt), desc(orders.reference)];
  switch (sort) {
    case 'placed':
      return [asc(orders.createdAt), desc(orders.reference)];
    case 'placed_desc':
      return newest;
    case 'status':
      return [asc(statusPriority), ...newest];
    case 'status_desc':
      return [desc(statusPriority), ...newest];
  }
}

/**
 * Three groups, not a rank per status: what to pick up next. Columns are
 * qualified by hand: a bare name binds to whatever table the query has.
 */
const statusPriority = sql<number>`case ${orders.status}
  when 'requested' then 0
  when 'approved' then 1
  when 'ready' then 1
  else 2
end`;

/** What a version carries when nothing about the order itself changed —
 * every snapshot column of the version being superseded, word for word. */
export function carriedSnapshot(row: OrderRow): OrderSnapshot {
  return {
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    paymentMethod: row.paymentMethod,
    fulfilmentMethod: row.fulfilmentMethod,
    partyName: row.partyName,
    partyRegistrationId: row.partyRegistrationId,
    billingStreet: row.billingStreet,
    billingStreet2: row.billingStreet2,
    billingPostalCode: row.billingPostalCode,
    billingCity: row.billingCity,
    billingRegion: row.billingRegion,
    billingCountry: row.billingCountry,
    deliveryStreet: row.deliveryStreet,
    deliveryStreet2: row.deliveryStreet2,
    deliveryPostalCode: row.deliveryPostalCode,
    deliveryCity: row.deliveryCity,
    deliveryRegion: row.deliveryRegion,
    deliveryCountry: row.deliveryCountry,
    deliveryZoneKey: row.deliveryZoneKey,
    deliveryFreeFromMinor: row.deliveryFreeFromMinor,
    pickupLocationKey: row.pickupLocationKey,
    pickupLocationName: row.pickupLocationName,
    pickupLocationAddress: row.pickupLocationAddress,
    preferredDate: row.preferredDate,
    customerNote: row.customerNote,
    totalMinor: row.totalMinor,
    currency: row.currency,
    tierKey: row.tierKey,
    shipmentCartons: row.shipmentCartons,
    shipmentVolume: row.shipmentVolume,
    shipmentWeight: row.shipmentWeight,
    shipmentApproximate: row.shipmentApproximate,
    shipmentUncoveredLines: row.shipmentUncoveredLines,
  };
}

/** Null where the order carries no invoice address of its own (FR-CART-07). */
export function rowBillingAddress(row: OrderRow): OrderAddress | null {
  return row.billingStreet &&
    row.billingPostalCode &&
    row.billingCity &&
    row.billingCountry
    ? {
        street: row.billingStreet,
        street2: row.billingStreet2,
        postalCode: row.billingPostalCode,
        city: row.billingCity,
        region: row.billingRegion,
        country: row.billingCountry,
      }
    : null;
}

export function toSummary(row: OrderRow, itemCount: number): OrderSummary {
  return {
    reference: row.reference,
    status: row.status as OrderStatus,
    paymentState: row.paymentState as PaymentState,
    fulfilmentMethod: row.fulfilmentMethod as OrderSummary['fulfilmentMethod'],
    createdAt: row.createdAt.toISOString(),
    totalMinor: row.totalMinor,
    currency: row.currency,
    itemCount,
  };
}

/** Where an order goes, who is invoiced and how it is paid, as checkout and an
 * adjustment both write it. */
export function detailColumns(
  order: {
    contact: OrderContact;
    party: OrderingParty;
    paymentMethod: string;
    fulfilmentMethod: string;
  },
  billing: AddressInput | null,
  { address: delivery, pickup, zone }: Fulfilment,
) {
  return {
    contactName: order.contact.name,
    contactEmail: order.contact.email,
    contactPhone: order.contact.phone,
    paymentMethod: order.paymentMethod,
    fulfilmentMethod: order.fulfilmentMethod,
    partyName: order.party.name,
    partyRegistrationId: order.party.registrationId,
    billingStreet: billing?.street ?? null,
    billingStreet2: billing?.street2 ?? null,
    billingPostalCode: billing?.postalCode ?? null,
    billingCity: billing?.city ?? null,
    billingRegion: billing?.region ?? null,
    billingCountry: billing?.country ?? null,
    deliveryStreet: delivery?.street ?? null,
    deliveryStreet2: delivery?.street2 ?? null,
    deliveryPostalCode: delivery?.postalCode ?? null,
    deliveryCity: delivery?.city ?? null,
    deliveryRegion: delivery?.region ?? null,
    deliveryCountry: delivery?.country ?? null,
    deliveryZoneKey: zone?.key ?? null,
    deliveryFreeFromMinor: zone?.freeFromMinor ?? null,
    pickupLocationKey: pickup?.key ?? null,
    pickupLocationName: pickup?.name ?? null,
    pickupLocationAddress: pickup?.address ?? null,
  };
}

export function shipmentColumns(shipment: {
  cartons: number;
  volume: string | null;
  weight: string | null;
  approximate: boolean;
  uncoveredLines: number;
}) {
  return {
    shipmentCartons: shipment.cartons,
    shipmentVolume: shipment.volume,
    shipmentWeight: shipment.weight,
    shipmentApproximate: shipment.approximate,
    shipmentUncoveredLines: shipment.uncoveredLines,
  };
}

/** A priced adjustment's lines as the rows a version holds. */
export function adjustedItems(
  priced: PricedAdjustment,
): Omit<typeof orderItems.$inferInsert, 'revisionId'>[] {
  return priced.lines.map((line, index) => ({
    sortOrder: index,
    productId: line.productId,
    productSourceId: line.sourceId,
    slug: line.slug,
    name: line.name,
    thumbnail: line.thumbnail,
    unit: line.unit,
    quantity: line.quantity,
    pieces: line.pieces,
    priceMinor: line.priceMinor,
    lineTotalMinor: line.lineTotalMinor,
    taxRate: line.taxRate,
    note: line.note,
  }));
}
