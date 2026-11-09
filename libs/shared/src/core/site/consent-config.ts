import * as z from 'zod';

import { ConsentPurpose } from './pages';

/**
 * Which forms ask for consent (NFR-LEGAL-09). No default: whether a form rests
 * on consent is a legal decision, and a missing switch would read as an
 * omission. Off where another ground (the contract, legitimate interest)
 * covers the processing.
 */
export const consentConfigSchema = z
  .object({
    contact: z.boolean(),
    account: z.boolean(),
  } satisfies Record<ConsentPurpose, z.ZodBoolean>)
  .strict();
export type ConsentConfig = z.infer<typeof consentConfigSchema>;
