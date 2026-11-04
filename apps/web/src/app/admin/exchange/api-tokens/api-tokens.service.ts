import { Injectable } from '@angular/core';
import { safe } from '@orpc/client';
import {
  API_TOKEN_ERROR_CODES,
  ApiToken,
  ApiTokenErrorCode,
  ApiTokenInput,
  CreatedApiToken,
} from '@b2b-catalog-platform/shared/admin/exchange';
import { adminApiTokensContract } from '../../contract-routes.generated';
import { createOrpcClient } from '../../../shared/core/orpc-client';

/** A revoke the server refused: the row is gone, the list stale. */
export type RevokeResult =
  { ok: true; token: ApiToken } | { ok: false; code: ApiTokenErrorCode };

function isApiTokenCode(code: string): code is ApiTokenErrorCode {
  return (API_TOKEN_ERROR_CODES as readonly string[]).includes(code);
}

/** The machine-token client (NFR-SEC-09). Nothing keeps a created value:
 * a browser is no place for a credential to linger. */
@Injectable({ providedIn: 'root' })
export class ApiTokensService {
  private client = createOrpcClient(adminApiTokensContract);

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
