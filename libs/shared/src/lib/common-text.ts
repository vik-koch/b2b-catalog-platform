import * as z from 'zod';
import type { DeepReadonly } from '../node/deep-readonly';
import { refuseCountForms } from './fill-text';

/**
 * The shop's shared names: wording that more than one text file would
 * otherwise repeat — the storefront, the admin, mail and the order summary all
 * read it from here. Only names belong here, never a sentence written for one
 * reader, and it is public: the browser receives it on every page.
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
  })
  .strict()
  .superRefine(refuseCountForms);

export type CommonText = DeepReadonly<z.infer<typeof commonTextSchema>>;
