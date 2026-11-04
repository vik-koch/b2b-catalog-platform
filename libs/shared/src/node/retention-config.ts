import * as z from 'zod';

/**
 * Days kept before the daily sweep, with no default: each is the deployment's
 * legal decision. `consentRecordDays` (NFR-LEGAL-09) runs from a withdrawal,
 * or a contact consent's giving; `destructionRecordDays` (NFR-LEGAL-12) from
 * the destruction; `orderDays` (NFR-LEGAL-14) from a finished order's last
 * change.
 */
export const retentionConfigSchema = z
  .object({
    consentRecordDays: z.number().int().positive(),
    destructionRecordDays: z.number().int().positive(),
    orderDays: z.number().int().positive(),
  })
  .strict();
export type RetentionConfig = z.infer<typeof retentionConfigSchema>;
