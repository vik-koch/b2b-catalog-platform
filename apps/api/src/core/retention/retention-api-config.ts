import * as z from 'zod';

/**
 * Retention's block of `api.json`: days kept before the daily sweep. No
 * default, as each is a legal decision. Apart from its loader, which reads
 * the file composed of this shape.
 */
export const retentionApiConfigShape = {
  /** From a withdrawal, or a contact consent's giving (NFR-LEGAL-09). */
  consentRecordDays: z.number().int().positive(),
  /** From the destruction (NFR-LEGAL-12). */
  destructionRecordDays: z.number().int().positive(),
  /** From a finished order's last change (NFR-LEGAL-14). */
  orderDays: z.number().int().positive(),
};

export type RetentionConfig = z.infer<
  z.ZodObject<typeof retentionApiConfigShape>
>;
