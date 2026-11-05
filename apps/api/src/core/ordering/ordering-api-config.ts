import * as z from 'zod';

/** The receipt always names the accepted terms' date (NFR-LEGAL-10), and
 * with `attachToReceipt` adds them as a PDF. No default: a legal decision.
 * Without published terms an order accepted none, so it does nothing. */
const termsConfigSchema = z.object({ attachToReceipt: z.boolean() }).strict();

/** Ordering's block of `api.json`. Apart from its loader, which reads the
 * file composed of this shape. */
export const orderingApiConfigShape = { terms: termsConfigSchema };

export type OrderingApiConfig = z.infer<
  z.ZodObject<typeof orderingApiConfigShape>
>;
