import * as z from 'zod';
import { API_TOKEN_SCOPES } from '../../platform/api-tokens';

/** What a token may do; issued by an admin, checked on every machine route. */
export const apiTokenScopeSchema = z.enum(API_TOKEN_SCOPES);

/** `insufficient-scope` is the machine's `insufficient-role`, kept apart so a
 * log says which path refused. */
export const machineAuthErrors = {
  'not-authenticated': { status: 401 },
  'insufficient-scope': { status: 403 },
} as const;
