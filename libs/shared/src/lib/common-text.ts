import * as z from 'zod';
import type { DeepReadonly } from '../node/deep-readonly';
import { refuseCountForms } from './fill-text';

const perReader = <T extends z.ZodType>(labels: T) =>
  z.object({ customer: labels, staff: labels }).strict();

const statusLabels = z
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

const paymentMethodLabels = z
  .object({ cash: z.string(), transfer: z.string(), card: z.string() })
  .strict();

const paymentStateLabels = z
  .object({ notDue: z.string(), awaiting: z.string(), paid: z.string() })
  .strict();

const field = <T extends z.ZodRawShape>(errors: T) =>
  z.object({ label: z.string(), ...errors }).strict();

/**
 * The shop's shared names: what a thing is called, wherever more than one text
 * file needs it — the storefront, the admin, mail and the order summary all
 * read it from here. Names and the checks on a field, never a view's own
 * sentences. Public: the browser receives it on every page.
 */
export const commonTextSchema = z
  .object({
    /**
     * Names of the shop's pages and routes, keyed by route segment — page
     * slugs plus feature routes like `inquiry`. Open by design (a record).
     */
    nav: z.record(z.string(), z.string()),
    /** Short unit names, as a quantity is stated beside goods. */
    units: z
      .object({ piece: z.string(), pack: z.string(), box: z.string() })
      .strict(),
    /** `{qty} {unit}` — a quantity bought in pieces. */
    quantity: z.string(),
    /** A quantity bought in packs or boxes, with what it came to in pieces. */
    quantityPieces: z.string(),
    /**
     * The tax basis under an order's total. `{rate}` is the rate every line
     * shares; the `mixed` forms stand where the lines differ, and each line
     * then states its own as `line`.
     */
    tax: z
      .object({
        included: z.string(),
        added: z.string(),
        none: z.string(),
        mixed: z.object({ included: z.string(), added: z.string() }).strict(),
        line: z.string(),
      })
      .strict(),
    /**
     * What an order and its parts are called. Where staff and customers read
     * a set differently — statuses, payment methods, payment states — the
     * whole set exists once per reader, never half shared.
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
        /** The customer account an order was placed from, as staff read it. */
        account: z.string(),
        /** An order placed without an account. */
        guest: z.string(),
        /** The heading over an order's lines. */
        items: perReader(z.string()),
        /** `ready` reads by fulfilment: on its way, or waiting to be collected. */
        statuses: perReader(statusLabels),
        paymentMethods: perReader(paymentMethodLabels),
        paymentStates: z
          .object({
            customer: paymentStateLabels,
            /** Staff read one state more: a cash order nobody has ticked yet. */
            staff: paymentStateLabels
              .extend({ cashOnHandover: z.string() })
              .strict(),
          })
          .strict(),
      })
      .strict(),
    /** How an order reaches the customer. */
    fulfilment: z
      .object({ label: z.string(), delivery: z.string(), pickup: z.string() })
      .strict(),
    /** A party's details, as every form that asks for them labels and checks
     * them. `companyId.format` carries `{examples}`. */
    fields: z
      .object({
        name: field({ required: z.string() }),
        email: field({ required: z.string(), invalid: z.string() }),
        phone: field({ required: z.string(), incomplete: z.string() }),
        companyName: field({ required: z.string() }),
        companyId: field({ required: z.string(), format: z.string() }),
      })
      .strict(),
  })
  .strict()
  .superRefine(refuseCountForms);

export type CommonText = DeepReadonly<z.infer<typeof commonTextSchema>>;
