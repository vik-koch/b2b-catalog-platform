import * as z from 'zod';
import type { DeepReadonly } from '../../platform/deep-readonly';

/** Ordering's block of `texts/shared.json`: what its views say in both
 * audiences, an order being read back to staff as the customer saw it. */
export const sharedOrderingTextShape = {
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
