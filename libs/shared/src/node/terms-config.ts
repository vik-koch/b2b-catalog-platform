import * as z from 'zod';

/**
 * How the receipt hands over the accepted terms (NFR-LEGAL-10): always their
 * date, and with `attachToReceipt` a PDF. No default: a legal decision. No
 * effect where `terms` is not published, as such an order accepted none.
 */
export const termsConfigSchema = z
  .object({ attachToReceipt: z.boolean() })
  .strict();
