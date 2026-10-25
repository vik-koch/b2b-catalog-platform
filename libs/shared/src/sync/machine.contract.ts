import { oc } from '@orpc/contract';
import * as z from 'zod';
import { API_TOKEN_SCOPES } from '../lib/accounts/api-token-constants';

/** What a token may do; issued by an admin, checked on every machine route. */
export const apiTokenScopeSchema = z.enum(API_TOKEN_SCOPES);

/**
 * What a machine client learns about its own credential: enough to check at
 * boot that it holds a working token with the capabilities it needs, and
 * nothing about the deployment it could not already infer.
 */
export const machineIdentitySchema = z
  .object({ name: z.string(), scopes: z.array(apiTokenScopeSchema) })
  .strict();
export type MachineIdentity = z.infer<typeof machineIdentitySchema>;
/**
 * The refusals a machine-authenticated route answers with. `not-authenticated`
 * is the same code the session guard uses and means the same thing — no usable
 * credential — while `insufficient-scope` is the machine counterpart of
 * `insufficient-role`: a valid token that may not do this. Kept apart from the
 * role code so a log line says which of the two authentication paths refused.
 */
export const MACHINE_AUTH_ERROR_CODES = [
  'not-authenticated',
  'insufficient-scope',
] as const;
export type MachineAuthErrorCode = (typeof MACHINE_AUTH_ERROR_CODES)[number];
export const machineAuthErrors = {
  'not-authenticated': { status: 401 },
  'insufficient-scope': { status: 403 },
} as const satisfies Record<MachineAuthErrorCode, { status: number }>;
/** Authenticated by the token alone; a session cookie never satisfies these. */
const machine = oc.errors(machineAuthErrors);

export const machineIdentityContract = {
  /**
   * The one route in this iteration a token reaches on its own. It exists so a
   * credential can be verified — by the adapter at boot, by an operator with
   * `curl` — without submitting a catalog to find out.
   */
  machineIdentity: machine
    .route({
      method: 'GET',
      path: '/machine/token',
      summary: 'What this token is (machine)',
    })
    .output(machineIdentitySchema),
};
