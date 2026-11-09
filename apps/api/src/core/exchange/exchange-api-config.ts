import * as z from 'zod';

import {
  customerSyncPolicySchema,
  syncPolicySchema,
} from '@b2b-catalog-platform/shared/core/exchange';

/** The exchange's block of `api.json`: what an automated run may do without
 * a person looking (FR-ADM-07). Optional whole, as each part has a default.
 * Apart from its loaders, which read the file composed of this shape. */
export const exchangeApiConfigShape = {
  autoApply: syncPolicySchema.optional(),
  /** The customer exchange's own ceilings (FR-ADM-11). */
  customerAutoApply: customerSyncPolicySchema.optional(),
};

export type ExchangeApiConfig = z.infer<
  z.ZodObject<typeof exchangeApiConfigShape>
>;
