import * as z from 'zod';
import { TAX_RATE_MAX } from './tax';

/** A percent with at most two decimals, compared in hundredths so 5.55
 * passes despite binary floating point. */
export const taxRateSchema = z
  .number()
  .min(0)
  .max(TAX_RATE_MAX)
  .refine(
    (rate) => Math.abs(rate * 100 - Math.round(rate * 100)) < 1e-6,
    'a tax rate has at most two decimals',
  );

/**
 * The deployment's tax basis (NFR-LEGAL-11). A basis that charges tax names
 * the default rate, and one that charges none has no rate to name — the union
 * makes either mistake a boot failure rather than a sentence with a hole in it.
 *
 * `statedAtPrices` also puts the statement beside the prices on the listings
 * and the product page, where a jurisdiction expects a consumer price to say
 * what it includes. Totals and the conditions page state it regardless. Under
 * `none` there is nothing to state at a price.
 */
export const taxConfigSchema = z.discriminatedUnion('basis', [
  z
    .object({
      basis: z.enum(['included', 'added']),
      rate: taxRateSchema,
      statedAtPrices: z.boolean(),
    })
    .strict(),
  z.object({ basis: z.literal('none') }).strict(),
]);
export type TaxConfig = z.infer<typeof taxConfigSchema>;
