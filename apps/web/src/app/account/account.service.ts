import { Injectable } from '@angular/core';
import { isDefinedError, safe } from '@orpc/client';
import {
  AccountProfile,
  UpdateAccountProfileRequest,
} from '@b2b-catalog-platform/shared';
import { accountContract } from '../core/contract-routes.generated';
import { createOrpcClient } from '../core/orpc-client';

/** What the delete form has to tell apart. */
export type DeleteAccountResult = 'ok' | 'wrong-password' | 'last-admin';

/**
 * The signed-in account's own record — the counterpart to the API's
 * AccountController, and the home for addresses and order history when they
 * arrive. Nothing here takes an account id: the session is the subject.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private client = createOrpcClient(accountContract);

  getProfile(): Promise<AccountProfile> {
    return this.client.getProfile();
  }

  /**
   * Correct the name and phone number. Nothing here is a refusal the form can
   * act on — the fields are validated before they are sent, and a 401 means the
   * session is gone, which the guards handle — so anything but success throws.
   */
  updateProfile(request: UpdateAccountProfileRequest): Promise<AccountProfile> {
    return this.client.updateProfile({ body: request });
  }

  /**
   * Delete this account (FR-AUTH-06). Two of the refusals are the form's to
   * show — a mistyped password, and the last admin, which is a real answer
   * rather than a fault — so they come back as results; anything else throws.
   */
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
