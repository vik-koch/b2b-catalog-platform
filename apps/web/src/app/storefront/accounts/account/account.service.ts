import { Injectable } from '@angular/core';
import { isDefinedError, safe } from '@orpc/client';
import { accountContract } from '../../contract-routes.generated';
import { createOrpcClient } from '../../../shared/core/orpc-client';
import {
  AccountProfile,
  UpdateAccountProfileRequest,
} from '@b2b-catalog-platform/shared/storefront/accounts';

/** What the delete form has to tell apart. */
export type DeleteAccountResult = 'ok' | 'wrong-password' | 'last-admin';

/** The signed-in account's own record: the session is the subject. */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly client = createOrpcClient(accountContract);

  getProfile(): Promise<AccountProfile> {
    return this.client.getProfile();
  }

  /** No refusal here is the form's to explain, so any failure throws. */
  updateProfile(request: UpdateAccountProfileRequest): Promise<AccountProfile> {
    return this.client.updateProfile({ body: request });
  }

  /** The two refusals the form explains come back; anything else throws. */
  async deleteAccount(password: string): Promise<DeleteAccountResult> {
    const { error } = await safe(
      this.client.deleteAccount({ body: { password } }),
    );

    if (!error) return 'ok';
    if (isDefinedError(error)) {
      if (error.code === 'wrong-current-password') return 'wrong-password';
      if (error.code === 'last-admin') return 'last-admin';
    }
    throw error;
  }
}
