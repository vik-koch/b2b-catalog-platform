import * as z from 'zod';

import type { DeepReadonly } from '../../platform/deep-readonly';

/** An order status per reading: `ready` is on its way or waiting to be
 * collected. The customers' set; staff have theirs in the admin text. */
export const orderStatusLabels = z
  .object({
    requested: z.string(),
    approved: z.string(),
    readyDelivery: z.string(),
    readyPickup: z.string(),
    completed: z.string(),
    declined: z.string(),
    cancelled: z.string(),
  })
  .strict();

export const paymentMethodLabels = z
  .object({ cash: z.string(), transfer: z.string(), card: z.string() })
  .strict();

export const paymentStateLabels = z
  .object({ notDue: z.string(), awaiting: z.string(), paid: z.string() })
  .strict();

/** Ordering's block of `texts/shared.json`: what its views say in both
 * audiences, an order being read back to staff as the customer saw it. */
export const sharedOrderingTextShape = {
  /**
   * What an order and its parts are called. The names read the same to
   * staff; the sets below them are the customer's, and staff have their own.
   */
  order: z
    .object({
      reference: z.string(),
      status: z.string(),
      total: z.string(),
      reason: z.string(),
      changeNote: z.string(),
      contact: z.string(),
      invoicedTo: z.string(),
      payment: z.string(),
      deliveryAddress: z.string(),
      preferredDelivery: z.string(),
      preferredPickup: z.string(),
      /** The heading over an order's lines. */
      items: z.string(),
      /** The customer's own note on the order. */
      note: z.string(),
      /** Where a collected order is picked up. */
      pickupPoint: z.string(),
      /** `{date}` the accepted terms were last changed. */
      termsVersion: z.string(),
      statuses: orderStatusLabels,
      paymentMethods: paymentMethodLabels,
      paymentStates: paymentStateLabels,
    })
    .strict(),
  /** How an order reaches the customer. */
  fulfilment: z
    .object({ label: z.string(), delivery: z.string(), pickup: z.string() })
    .strict(),
  /** The summary card beside the lines: what the order is, then what the
   * estimate makes of it. */
  orderSummary: z
    .object({
      title: z.string(),
      /** How many lines the order holds: its own figure, stated whether or
       * not an estimate arrives. */
      lines: z.string(),
      subtotal: z.string(),
      /** The subtotal covers only the priceable lines. */
      totalIncomplete: z.string(),
      /** The shipment estimate (FR-UNIT-11) as row captions; the figures
       * come from the estimate and the deployment's box units. */
      shipmentCartons: z.string(),
      shipmentVolume: z.string(),
      shipmentWeight: z.string(),
      shipmentApproximate: z.string(),
      /** How many lines the estimate could not cover. Worded so `{count}`
       * lands at the end: there are no plural forms, so "1 lines" is a
       * sentence to rewrite, not a rule to add. */
      shipmentUncovered: z.string(),
    })
    .strict(),
  /** An order's details as the customer reads them. */
  orderBlocks: z
    .object({
      /** Where the invoice goes to the delivery address, said instead of
       * printing the same four lines twice. */
      billingSame: z.string(),
      /** No date asked for, which is an answer rather than a blank. */
      whenAny: z.string(),
    })
    .strict(),
};

export type SharedOrderingText = DeepReadonly<
  z.infer<z.ZodObject<typeof sharedOrderingTextShape>>
>;
