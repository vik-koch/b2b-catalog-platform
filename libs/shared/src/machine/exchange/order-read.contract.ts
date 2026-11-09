/**
 * The outbound read of orders (FR-ADM-08, NFR-LEGAL-07). Its own scope,
 * `order-read`, apart from the write-back's; not gated on ownership.
 */
import { oc } from '@orpc/contract';
import * as z from 'zod';

import { productUnitSchema } from '../../core/catalog/catalog.contract';
import { TAX_BASES } from '../../core/catalog/tax';
import { machineAuthErrors } from '../../core/exchange/machine-auth.contract';
import {
  fulfilmentMethodSchema,
  orderAddressSchema,
  orderContactSchema,
  orderingPartySchema,
  orderPickupSchema,
  orderStatusSchema,
  paymentMethodSchema,
  paymentStateSchema,
} from '../../core/ordering/orders.contract';

/** Smaller than the customer read's: an order carries lines and addresses. */
const ORDER_READ_MAX_LIMIT = 50;

/** The account by the exchange's handles (FR-ADM-14). `accountId` matches an
 * unkeyed account, as the customer read reports it (FR-ADM-18). */
const machineOrderCustomerSchema = z
  .object({
    accountId: z.uuid(),
    sourceId: z.string().nullable(),
  })
  .strict();

/** By the source's product key, not the renamable slug. `pieces` is the
 * quantity; `unit` and `quantity` are the frozen reading (FR-UNIT-11), never
 * to compute from. */
const machineOrderLineSchema = z
  .object({
    productSourceId: z.string(),
    /** As at the order, not as the product reads now. */
    name: z.string(),
    unit: productUnitSchema,
    quantity: z.number().positive(),
    pieces: z.number().int().positive(),
    /** One piece, as charged. */
    priceMinor: z.number().int().nonnegative(),
    lineTotalMinor: z.number().int().nonnegative(),
    /** The stated percent (NFR-LEGAL-11), null under a basis without tax.
     * Stated only: nothing here was computed with it. */
    taxRate: z.number().nullable(),
    note: z.string().nullable(),
  })
  .strict();
export type MachineOrderLine = z.infer<typeof machineOrderLineSchema>;

/**
 * The current version, whole (FR-ORD-03). `revisionNumber` is what a
 * write-back answers (FR-ADM-08). Not here: the shipment estimate and zone
 * (the platform's own arithmetic), the guest link (a credential), the
 * documents (FR-ORD-05).
 */
const machineOrderSchema = z
  .object({
    /** Survives every version; what a write-back addresses. */
    reference: z.string(),
    status: orderStatusSchema,
    /** Today's, not the version's (FR-ORD-04). */
    paymentState: paymentStateSchema,
    /** 1 is the order as submitted. */
    revisionNumber: z.number().int().positive(),
    /** Null on a guest order. */
    customer: machineOrderCustomerSchema.nullable(),
    contact: orderContactSchema,
    /** As the order froze it (FR-CART-09). */
    party: orderingPartySchema,
    fulfilmentMethod: fulfilmentMethodSchema,
    paymentMethod: paymentMethodSchema,
    /** Set on a delivery, null on a pickup. */
    deliveryAddress: orderAddressSchema.nullable(),
    /** Set on a pickup, null on a delivery. */
    pickup: orderPickupSchema.nullable(),
    /** Null where the deployment invoices no address of its own. */
    billingAddress: orderAddressSchema.nullable(),
    /** A wish, not a promise (FR-CART-07). */
    preferredDate: z.iso.date().nullable(),
    /** A write-back never overwrites it. */
    customerNote: z.string().nullable(),
    /** Declined or called off only (FR-ORD-02). */
    statusReason: z.string().nullable(),
    /** Cancelled only. A `customer` cancellation no writer may override
     * (FR-ADM-10); a `shop` one, the owning system's included, it may reopen. */
    cancelledBy: z.enum(['customer', 'shop']).nullable(),
    /** The shop's note on this version, if any. */
    note: z.string().nullable(),
    /** Null is the default list. */
    tierKey: z.string().nullable(),
    lines: z.array(machineOrderLineSchema),
    totalMinor: z.number().int().nonnegative(),
    currency: z.string(),
    /** Whether `totalMinor` includes tax, adds it or has none (NFR-LEGAL-11),
     * fixed at submission. */
    taxBasis: z.enum(TAX_BASES),
    createdAt: z.iso.datetime(),
    /** The last status move (FR-ORD-01). */
    statusChangedAt: z.iso.datetime(),
    paidAt: z.iso.datetime().nullable(),
    /** Any change; what `since` and the ordering use. */
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type MachineOrder = z.infer<typeof machineOrderSchema>;

/** As the customer read: by last change, so yesterday's order cancelled this
 * morning shows without a full re-read. */
const listMachineOrdersQuerySchema = z
  .object({
    /** Inclusive: re-reading one order is harmless, missing one is not. */
    since: z.iso.datetime().optional(),
    /** `nextCursor` from the previous page, verbatim. */
    cursor: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(ORDER_READ_MAX_LIMIT)
      .default(ORDER_READ_MAX_LIMIT),
  })
  .strict();
export type ListMachineOrdersQuery = z.infer<
  typeof listMachineOrdersQuerySchema
>;

const machineOrdersPageSchema = z
  .object({
    orders: z.array(machineOrderSchema),
    /** Opaque, null at the end. Across runs, resume from the last order's
     * `updatedAt` as `since`. */
    nextCursor: z.string().nullable(),
  })
  .strict();
export type MachineOrdersPage = z.infer<typeof machineOrdersPageSchema>;

const machineRead = oc.errors({
  ...machineAuthErrors,
  /** Refused, not restarted from the top without a word. */
  'invalid-cursor': { status: 400 },
});

export const machineOrderReadContract = {
  listOrders: machineRead
    .route({
      method: 'GET',
      path: '/machine/orders',
      inputStructure: 'detailed',
      summary: 'Read orders (machine)',
    })
    .input(z.object({ query: listMachineOrdersQuerySchema }))
    .output(machineOrdersPageSchema),

  /** For a write-back refused as `order-changed` (FR-ADM-08). */
  getOrder: machineRead
    .errors({
      'order-not-found': { status: 404 },
    })
    .route({
      method: 'GET',
      path: '/machine/orders/{reference}',
      inputStructure: 'detailed',
      summary: 'Read one order (machine)',
    })
    .input(z.object({ params: z.object({ reference: z.string() }) }))
    .output(machineOrderSchema),
};
