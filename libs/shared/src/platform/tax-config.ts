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
 * The deployment's tax basis (NFR-LEGAL-11). The union makes a charging basis
 * without a rate, or `none` with one, a boot failure. `statedAtPrices` also
 * states it beside listing and product prices; totals always state it.
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
