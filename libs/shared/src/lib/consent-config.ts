import * as z from 'zod';
import { ConsentPurpose } from './page-constants';

/**
 * Which consents this deployment asks for (NFR-LEGAL-09), one switch per
 * purpose. Both are stated, with no default: whether a contact form or a
 * customer account rests on consent is a legal decision for the deployment,
 * and one that reads as an omission when it is left out. Where the processing
 * rests on another ground — the contract, the shop's legitimate interest — the
 * switch is off and the form asks nothing.
 *
 * Shared, because the API refuses a form that owes a consent it was not given,
 * and the browser draws the box the API will hold it to.
 */
export const consentConfigSchema = z
  .object({
    contact: z.boolean(),
    account: z.boolean(),
  } satisfies Record<ConsentPurpose, z.ZodBoolean>)
  .strict();
export type ConsentConfig = z.infer<typeof consentConfigSchema>;
