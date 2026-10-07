import * as z from 'zod';

/**
 * How long the evidence of personal data is itself kept, in days, before the
 * daily sweep deletes it. Stated, with no default, because each is a legal
 * decision for the deployment.
 *
 * - `consentRecordDays` (NFR-LEGAL-09) runs from a consent's withdrawal, or
 *   for a contact consent, which is used up once answered, from when it was
 *   given. An account consent nobody withdrew is kept while the account is.
 * - `destructionRecordDays` (NFR-LEGAL-12) runs from the destruction.
 * - `orderDays` (NFR-LEGAL-14) runs from the last thing that happened to a
 *   finished order, after which its personal details are removed.
 */
export const retentionConfigSchema = z
  .object({
    consentRecordDays: z.number().int().positive(),
    destructionRecordDays: z.number().int().positive(),
    orderDays: z.number().int().positive(),
  })
  .strict();
export type RetentionConfig = z.infer<typeof retentionConfigSchema>;
