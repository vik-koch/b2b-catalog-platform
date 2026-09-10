import { Injectable } from '@angular/core';
import { safe } from '@orpc/client';
import {
  API_TOKEN_ERROR_CODES,
  ApiToken,
  ApiTokenErrorCode,
  ApiTokenInput,
  CreatedApiToken,
} from '@b2b-catalog-platform/shared';
import { apiTokensContract } from '../../core/contract-routes.generated';
import { createOrpcClient } from '../../core/orpc-client';

/** A revoke the server refused — the row is gone, so the list is stale. */
export type RevokeResult =
  { ok: true; token: ApiToken } | { ok: false; code: ApiTokenErrorCode };

function isApiTokenCode(code: string): code is ApiTokenErrorCode {
  return (API_TOKEN_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The machine-token admin client (NFR-SEC-09). The create call is the only one
 * whose answer carries the value; nothing here keeps it, because the screen
 * shows it once and the browser is not where a credential should linger.
 */
@Injectable({ providedIn: 'root' })
export class ApiTokensService {
  private client = createOrpcClient(apiTokensContract);

  async list(): Promise<ApiToken[]> {
    return (await this.client.listApiTokens()).tokens;
  }

  create(body: ApiTokenInput): Promise<CreatedApiToken> {
    return this.client.createApiToken({ body });
  }

  async revoke(id: string): Promise<RevokeResult> {
    const { error, data, isDefined } = await safe(
      this.client.revokeApiToken({ params: { id } }),
    );
    if (isDefined && isApiTokenCode(error.code)) {
      return { ok: false, code: error.code };
    }
    if (error) throw error;
    return { ok: true, token: data };
  }
}
