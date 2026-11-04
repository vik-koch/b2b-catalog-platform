import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  apiTokenScopeSchema,
  machineAuthErrors,
} from '../../core/exchange/machine-auth.contract';

/** Enough to check a working token at boot, nothing more. */
const machineIdentitySchema = z
  .object({ name: z.string(), scopes: z.array(apiTokenScopeSchema) })
  .strict();

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
