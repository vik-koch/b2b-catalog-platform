import * as z from 'zod';
import type { DeepReadonly } from '../../platform/deep-readonly';
import { addressConfigSchema } from './address-config';
import { signInStepConfigSchema } from './sign-in-step-config';
import { CUSTOMER_TYPES } from './users';

/** The accounts' block of `deployment.json`. */
export const accountsConfigShape = {
  /**
   * The customers the shop sells to (FR-AUTH-13), listed so every deployment
   * says it. A kind left out is offered nowhere and refused wherever an
   * account or order is written. A sole trader with a number is a company.
   */
  customerTypes: z
    .array(z.enum(CUSTOMER_TYPES))
    .min(1)
    .refine((types) => new Set(types).size === types.length, {
      message: 'a customer type is listed twice',
    }),
  /** The second sign-in step (FR-AUTH-12). */
  signInStep: signInStepConfigSchema.optional(),
  /** Where the shop ships. Without it, the picker offers nothing. */
  address: addressConfigSchema.optional(),
};

export type AccountsConfig = DeepReadonly<
  z.infer<z.ZodObject<typeof accountsConfigShape>>
>;
