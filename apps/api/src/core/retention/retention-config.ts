import * as z from 'zod';

/** Days kept before the daily sweep. No default: each is a legal decision. */
export const retentionConfigSchema = z
  .object({
    /** From a withdrawal, or a contact consent's giving (NFR-LEGAL-09). */
    consentRecordDays: z.number().int().positive(),
    /** From the destruction (NFR-LEGAL-12). */
    destructionRecordDays: z.number().int().positive(),
    /** From a finished order's last change (NFR-LEGAL-14). */
    orderDays: z.number().int().positive(),
  })
  .strict();
export type RetentionConfig = z.infer<typeof retentionConfigSchema>;
