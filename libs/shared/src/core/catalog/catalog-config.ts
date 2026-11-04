import * as z from 'zod';

/** The catalog's keys of `deployment.json`. */
export const catalogConfigShape = {
  catalog: z
    .object({
      /** Prices are integer minor units; this names their one currency. */
      currency: z
        .object({
          /** ISO 4217, e.g. "EUR". */
          code: z.string(),
        })
        .strict(),
      /** Whether a cart missing what its products are sold with may still be
       * ordered (FR-SET-04). Advisory by default; set, the API refuses too. */
      pairingsEnforced: z.boolean(),
      /** "Few left" for a product with neither box nor pack (FR-STOCK-02);
       * the admin reads it to show the threshold a product resolves to. */
      lowStockThresholdPieces: z.number().int().positive().optional(),
      /** Whether listings draw sort controls (FR-SEARCH-04). Off, `sort`
       * still works, so a saved link opens what was saved. */
      sortControlsEnabled: z.boolean(),
      /** Labels only: the numbers are stored as entered. */
      boxUnits: z
        .object({
          volume: z.string(),
          weight: z.string(),
        })
        .strict(),
    })
    .strict(),
};
