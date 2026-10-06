import * as z from 'zod';

/**
 * How the receipt hands over the terms an order accepted (NFR-LEGAL-10). It
 * always names their date; `attachToReceipt` also attaches them as a PDF,
 * for a jurisdiction that wants the terms on a medium the customer keeps.
 * Stated, with no default, because it is a legal decision for the deployment.
 * Has no effect where `terms` is not published: such an order accepted none.
 */
export const termsConfigSchema = z
  .object({ attachToReceipt: z.boolean() })
  .strict();
export type TermsConfig = z.infer<typeof termsConfigSchema>;
