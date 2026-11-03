import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  apiTokenScopeSchema,
  machineAuthErrors,
} from '../../core/exchange/machine-auth.contract';

/**
 * What a machine client learns about its own credential: enough to check at
 * boot that it holds a working token with the capabilities it needs, and
 * nothing about the deployment it could not already infer.
 */
export const machineIdentitySchema = z
  .object({ name: z.string(), scopes: z.array(apiTokenScopeSchema) })
  .strict();
export type MachineIdentity = z.infer<typeof machineIdentitySchema>;

/** Authenticated by the token alone; a session cookie never satisfies these. */
const machine = oc.errors(machineAuthErrors);

export const machineIdentityContract = {
  /**
   * Lets a credential be verified (by the adapter at boot, by an operator with
   * `curl`) without submitting a catalog to find out.
   */
  machineIdentity: machine
    .route({
      method: 'GET',
      path: '/machine/token',
      summary: 'What this token is (machine)',
    })
    .output(machineIdentitySchema),
};
