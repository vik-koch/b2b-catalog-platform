import * as z from 'zod';
import { API_TOKEN_SCOPES } from '../../platform/api-token-constants';

/** What a token may do; issued by an admin, checked on every machine route. */
export const apiTokenScopeSchema = z.enum(API_TOKEN_SCOPES);

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
