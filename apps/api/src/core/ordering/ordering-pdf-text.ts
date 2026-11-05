import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import * as z from 'zod';

/** Ordering's block of `texts/pdf.json`: the documents an order carries. */
export const orderingPdfTextShape = {
  /** The order summary (FR-ORD-05, FR-ACC-02). */
  orderSummary: z
    .object({
      /** Carries `{reference}`. */
      title: z.string(),
      placedLabel: z.string(),
      /** Where the customer named no date. */
      whenAny: z.string(),
      itemsLabel: z.string(),
      quantityLabel: z.string(),
      lineTotalLabel: z.string(),
      /** How to return the goods, under the total (NFR-LEGAL-10): the
       * summary is the paper handed over with them. */
      returnNotice: z.string().optional(),
      /** On every page: what this document is, and what it is not. */
      footer: z.string(),
    })
    .strict(),
  /** The terms of sale attached to a receipt (NFR-LEGAL-10). */
  terms: z
    .object({
      /** `{date}` is the version's day as YYYY-MM-DD. */
      fileName: z.string(),
    })
    .strict(),
};

export type OrderingPdfText = DeepReadonly<
  z.infer<z.ZodObject<typeof orderingPdfTextShape>>
>;
