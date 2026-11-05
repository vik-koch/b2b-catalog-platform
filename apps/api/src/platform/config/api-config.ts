import {
  customerSyncPolicySchema,
  syncPolicySchema,
} from '@b2b-catalog-platform/shared/core/exchange';
import { loadConfig } from '@b2b-catalog-platform/shared/node';
import { mergeShapes } from '@b2b-catalog-platform/shared/platform';
import { ORDERING_AREA } from '@b2b-catalog-platform/shared/core/ordering';
import { orderingApiConfigShape } from '../../core/ordering/ordering-api-config';
import { retentionConfigSchema } from '../../core/retention/retention-config';
import { sessionConfigSchema } from '../auth/session-config';
import * as z from 'zod';

/** The keys of `api.json` no area claims. */
const platformApiConfigShape = {
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
};

/** `api.json`: what only the API reads, kept out of `deployment.json`, which
 * every page carries. Every area's block, so a stray key stops the boot. */
export const apiConfigSchema = z
  .object(
    mergeShapes(platformApiConfigShape, {
      [ORDERING_AREA]: z.object(orderingApiConfigShape).strict(),
    }),
  )
  .strict();

type ApiConfig = z.infer<typeof apiConfigSchema>;

let cached: ApiConfig | undefined;
function loadWhole(): ApiConfig {
  return (cached ??= loadConfig(apiConfigSchema, 'api.json') as ApiConfig);
}

/** The keys no area claims; an area reads its block through its loader. */
export function loadApiConfig(): Omit<ApiConfig, 'ordering'> {
  return loadWhole();
}

/** An area's block, checked with the whole file on first read. */
export function loadApiConfigBlock<T>(area: string): T {
  return (loadWhole() as unknown as Record<string, T>)[area];
}
