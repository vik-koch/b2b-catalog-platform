/** Machine tokens (NFR-SEC-09): a row, not an account. It has no password or
 * role and cannot sign in; the admin issues and revokes it here. */
import { oc } from '@orpc/contract';
import * as z from 'zod';

import { API_TOKEN_NAME_MAX_LENGTH } from '../../core/exchange/api-token-scopes';
import { apiTokenScopeSchema } from '../../core/exchange/machine-auth.contract';
import { commonAuthErrors } from '../../platform/api-error';
import { storedEmailField } from '../../platform/contact-config';

/** At least one, as a token allowed nothing misleads; each once. */
const apiTokenScopesSchema = z
  .array(apiTokenScopeSchema)
  .min(1)
  .refine(
    (scopes) => new Set(scopes).size === scopes.length,
    'A capability can only be granted once',
  );

/** No hash, no value: the value exists for one response only. */
const apiTokenSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    scopes: z.array(apiTokenScopeSchema),
    /** The clear head of the value, so a row is recognisable. */
    prefix: z.string(),
    createdAt: z.iso.datetime(),
    /** Null once the issuing account is gone. */
    createdBy: storedEmailField.nullable(),
    /** Shows a token nobody retired but nobody uses. */
    lastUsedAt: z.iso.datetime().nullable(),
    /** The row is kept for the audit. */
    revokedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type ApiToken = z.infer<typeof apiTokenSchema>;

/**
 * No expiry: a scheduled caller failing some midnight is an outage nobody is
 * on hand for, and revoking answers the same threat. Scopes cannot be edited
 * later; a replacement and a revoke leave an event with a time and a name.
 */
const apiTokenInputSchema = z
  .object({
    name: z.string().trim().min(1).max(API_TOKEN_NAME_MAX_LENGTH),
    scopes: apiTokenScopesSchema,
  })
  .strict();
export type ApiTokenInput = z.infer<typeof apiTokenInputSchema>;

/** The only time the value is sent: nothing stored can be read back. */
const createdApiTokenSchema = apiTokenSchema
  .extend({ token: z.string() })
  .strict();
export type CreatedApiToken = z.infer<typeof createdApiTokenSchema>;

export const API_TOKEN_ERROR_CODES = ['api-token-not-found'] as const;
export type ApiTokenErrorCode = (typeof API_TOKEN_ERROR_CODES)[number];

const apiTokenErrors = {
  'api-token-not-found': { status: 404 },
} as const satisfies Record<ApiTokenErrorCode, { status: number }>;

/** Admin only: a manager never holds a credential. */
const admin = oc.errors(commonAuthErrors);

export const adminApiTokensContract = {
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

  /** A POST, not a DELETE: the row stays, as its runs point at it. */
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
};
