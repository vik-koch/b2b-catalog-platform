import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  API_TOKEN_NAME_MAX_LENGTH,
  API_TOKEN_SCOPES,
} from './api-token-constants';
import { commonAuthErrors } from './api-error';

/**
 * Machine tokens (NFR-SEC-09): the credential an automated client presents
 * instead of a session.
 *
 * A token is a row, not an account — it has no password, no inbox and no role,
 * and cannot sign in. Two surfaces meet here: the admin screen that issues and
 * revokes them, guarded like the rest of the admin API, and the one route a
 * *machine* reaches, which the token authenticates by itself.
 */

export const apiTokenScopeSchema = z.enum(API_TOKEN_SCOPES);

/**
 * The capabilities on one token. At least one — a token allowed nothing is a
 * row that can only mislead — and each named once, since a repeated capability
 * is a typo rather than a stronger grant.
 */
export const apiTokenScopesSchema = z
  .array(apiTokenScopeSchema)
  .min(1)
  .refine(
    (scopes) => new Set(scopes).size === scopes.length,
    'A capability can only be granted once',
  );

/**
 * A token as the admin list shows it. No hash and no value: the value exists
 * for one response and is then unrecoverable by design.
 *
 * `lastUsedAt` is the field the screen is really for — it is what makes a token
 * nobody has retired but nobody uses either visible.
 */
export const apiTokenSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    scopes: z.array(apiTokenScopeSchema),
    /** The clear head of the value, so a row is recognisable. */
    prefix: z.string(),
    createdAt: z.iso.datetime(),
    /** Who issued it, by email. Null once that account is gone. */
    createdBy: z.email().nullable(),
    lastUsedAt: z.iso.datetime().nullable(),
    /** Set means refused from that moment on; the row is kept for the audit. */
    revokedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type ApiToken = z.infer<typeof apiTokenSchema>;

/**
 * What an admin fills in. Only a label and the capabilities — everything else
 * about a token is generated, and there is deliberately no expiry field: a
 * scheduled caller that stops working at midnight some months from now is an
 * outage nobody is on hand for, and revocation is the control that answers the
 * same threat on the operator's own timing.
 *
 * The capabilities are not editable afterwards. Widening a live credential's
 * reach in place leaves no moment at which anyone decided to, and narrowing it
 * breaks the client silently; issuing a replacement and revoking the old one
 * makes both an event with a time and a name on it.
 */
export const apiTokenInputSchema = z
  .object({
    name: z.string().trim().min(1).max(API_TOKEN_NAME_MAX_LENGTH),
    scopes: apiTokenScopesSchema,
  })
  .strict();
export type ApiTokenInput = z.infer<typeof apiTokenInputSchema>;

/**
 * The creating call's answer — the row, plus the only time the value is ever
 * sent. The screen shows it once and says so; there is no endpoint that reads
 * it back, because there is nothing stored to read.
 */
export const createdApiTokenSchema = apiTokenSchema
  .extend({ token: z.string() })
  .strict();
export type CreatedApiToken = z.infer<typeof createdApiTokenSchema>;

/**
 * What a machine client learns about its own credential: enough to check at
 * boot that it holds a working token with the capabilities it needs, and
 * nothing about the deployment it could not already infer.
 */
export const machineIdentitySchema = z
  .object({ name: z.string(), scopes: z.array(apiTokenScopeSchema) })
  .strict();
export type MachineIdentity = z.infer<typeof machineIdentitySchema>;

export const API_TOKEN_ERROR_CODES = ['api-token-not-found'] as const;
export type ApiTokenErrorCode = (typeof API_TOKEN_ERROR_CODES)[number];

const apiTokenErrors = {
  'api-token-not-found': { status: 404 },
} as const satisfies Record<ApiTokenErrorCode, { status: number }>;

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
} as const;

/** Issuing and revoking is admin work — a manager never holds a credential. */
const admin = oc.errors(commonAuthErrors);
/** Authenticated by the token alone; a session cookie never satisfies these. */
const machine = oc.errors(machineAuthErrors);

export const apiTokensContract = {
  listApiTokens: admin
    .route({
      method: 'GET',
      path: '/admin/api-tokens',
      summary: 'List the machine tokens (admin)',
    })
    .output(z.object({ tokens: z.array(apiTokenSchema) }).strict()),

  createApiToken: admin
    .route({
      method: 'POST',
      path: '/admin/api-tokens',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Issue a machine token, returning its value once (admin)',
    })
    .input(z.object({ body: apiTokenInputSchema }))
    .output(createdApiTokenSchema),

  /**
   * A POST rather than a DELETE: the row survives, because the sync runs it
   * made point at it and an audit trail with a hole in it is worse than a list
   * with a retired row on it.
   */
  revokeApiToken: admin
    .route({
      method: 'POST',
      path: '/admin/api-tokens/{id}/revoke',
      inputStructure: 'detailed',
      summary: 'Revoke a machine token (admin)',
    })
    .errors(apiTokenErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(apiTokenSchema),

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
