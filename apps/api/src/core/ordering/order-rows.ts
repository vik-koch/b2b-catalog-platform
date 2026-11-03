import {
  OrderAddress,
  OrderStatus,
  OrderSubmission,
  OrderSummary,
  PaymentState,
  StaffOrderSort,
} from '@b2b-catalog-platform/shared/core/ordering';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { asc, desc, getTableColumns, sql, SQL } from 'drizzle-orm';
import { alias, PgColumn } from 'drizzle-orm/pg-core';
import { AddressInput } from '@b2b-catalog-platform/shared/core/accounts';
import { PickupLocation } from '../../config/deployment-config';
import {
  orderItems,
  orderRevisions,
  orders,
  pageVersions,
} from '../../db/schema';

/**
 * The snapshot half of an order, ready to be spread into a projection — the
 * revision's own bookkeeping (which order, which number, who wrote it) taken
 * out, since a row that says what the order *is* has no use for it.
 */
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
 * An order and one version of it, read as **one flat row** (ADR 0051).
 *
 * Flattened on purpose: the snapshot columns land exactly where they used to
 * live, so everything that reads an order is untouched by the split and only
 * the write side has to know there are two tables now.
 *
 * The version's `status` and `statusReason` come last and win. That is the
 * whole of how a customer can be shown a version the order has moved past: a
 * revision is a complete reading of the order, and nothing that renders one
 * has to be told which. `orders.status` stays the column a *query* filters and
 * sorts on, and is named through `orders` where that is what is meant.
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
 * An order whose personal details were removed (NFR-LEGAL-14) is finished for
 * good. Moving it would run an order with nobody to deliver to, and writing to
 * its customer would mail the placeholder address the removal left behind.
 * Recording money against it stays possible: that is a fact about the order,
 * not a step in it.
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
 * The half of an order that is about the order rather than its lines — where
 * it goes, who it is invoiced to and how it is paid. The checkout's submission
 * and a manager's adjustment both carry it, and both are held to it.
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
 * How the staff list is ordered (FR-AUTH-03).
 *
 * By default the orders nobody has answered yet come first, then those that
 * have been approved, then the two ways an order ends — which is the order a
 * manager works down. Within a group, and for the date sort, newest first.
 *
 * Every ordering closes with the reference, so two orders placed in the same
 * millisecond cannot swap pages between requests and be shown twice.
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
 * What an order needs, as a number to sort by: a request is waiting on staff,
 * an accepted or ready one is in hand, and a finished or refused one is over.
 * Three groups rather than one rank per status, because the question the sort
 * answers is what to pick up next, not how far along each order is. Columns are
 * qualified by hand — a bare name in a template binds to whatever table the
 * surrounding query happens to make available.
 */
export const statusPriority = sql<number>`case ${orders.status}
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

/**
 * The invoice address an order row carries, or null where it carries none —
 * a deployment that invoices no address of its own (FR-CART-07), or an order
 * from before it asked.
 */
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
