import {
  customerSyncPolicySchema,
  syncPolicySchema,
} from '@b2b-catalog-platform/shared/core/exchange';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { termsConfigSchema } from '../../core/ordering/terms-config';
import { retentionConfigSchema } from '../../core/retention/retention-config';
import { sessionConfigSchema } from '../auth/session-config';
import * as z from 'zod';

/** `api.json`: what only the API reads, kept out of `deployment.json`, which
 * every page carries. */
export const apiConfigSchema = z
  .object({
    /** Whether the receipt attaches the accepted terms (NFR-LEGAL-10). */
    terms: termsConfigSchema,
    /** How long consent and destruction records, and finished orders' personal
     * details, are kept (NFR-LEGAL-09/12/14). */
    retention: retentionConfigSchema,
    /** How long a session lasts without use (FR-AUTH-12). */
    session: sessionConfigSchema.optional(),
    /** What an automated run may do without a person looking (FR-ADM-07). */
    sync: z
      .object({
        autoApply: syncPolicySchema.optional(),
        customerAutoApply: customerSyncPolicySchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

type ApiConfig = z.infer<typeof apiConfigSchema>;

let cached: ApiConfig | undefined;
export function loadApiConfig(): ApiConfig {
  return (cached ??= loadConfig(apiConfigSchema, 'api.json') as ApiConfig);
}
