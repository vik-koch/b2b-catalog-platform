import {
  customerSyncPolicySchema,
  retentionConfigSchema,
  sessionConfigSchema,
  syncPolicySchema,
  termsConfigSchema,
} from '@b2b-catalog-platform/shared';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import * as z from 'zod';

/**
 * `api.json`: what only the API reads. Kept out of `deployment.json`, which
 * the web puts into every page — a visitor has no use for how long records
 * are kept or what a catalog run may do unattended, so they are not shown it.
 */
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

export type ApiConfig = z.infer<typeof apiConfigSchema>;

/** Read once per process, like the deployment config. */
let cached: ApiConfig | undefined;
export function loadApiConfig(): ApiConfig {
  return (cached ??= loadConfig(apiConfigSchema, 'api.json') as ApiConfig);
}

/** Test seam: drops the memoized config so a spec can load a different file. */
export function resetApiConfig(): void {
  cached = undefined;
}
