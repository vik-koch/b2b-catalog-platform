import { Injectable } from '@angular/core';
import { safe } from '@orpc/client';
import {
  CONSENT_WITHDRAWAL_ERROR_CODES,
  ConsentRecord,
  ConsentWithdrawalErrorCode,
  FindConsentsQuery,
} from '@b2b-catalog-platform/shared';
import { consentsContract } from '../../core/contract-routes.generated';
import { createOrpcClient } from '../../core/orpc-client';

/** An entered withdrawal: the record as it now reads, or why it was refused. */
export type WithdrawResult =
  | { ok: true; record: ConsentRecord }
  | { ok: false; code: ConsentWithdrawalErrorCode };

/** The consent lookup's client: the API's ConsentAdminController. */
@Injectable({ providedIn: 'root' })
export class ConsentsService {
  private client = createOrpcClient(consentsContract);

  async find(query: FindConsentsQuery): Promise<ConsentRecord[]> {
    return (await this.client.findConsents({ query })).consents;
  }

  /** A declared refusal comes back by its code; anything else throws. */
  async withdraw(id: string, note: string): Promise<WithdrawResult> {
    const result = await safe(
      this.client.withdrawConsent({ params: { id }, body: { note } }),
    );
    if (result.isSuccess) return { ok: true, record: result.data };
    const code = result.isDefined ? result.error.code : undefined;
    if (
      code &&
      (CONSENT_WITHDRAWAL_ERROR_CODES as readonly string[]).includes(code)
    ) {
      return { ok: false, code: code as ConsentWithdrawalErrorCode };
    }
    throw result.error;
  }
}
