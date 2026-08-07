import { Injectable } from '@angular/core';
import {
  accountContract,
  AccountProfile,
  UpdateAccountProfileRequest,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

/** What the delete form has to tell apart. */
export type DeleteAccountResult = 'ok' | 'wrong-password' | 'last-admin';

/**
 * The signed-in account's own record — the counterpart to the API's
 * AccountController, and the home for addresses and order history when they
 * arrive. Nothing here takes an account id: the session is the subject.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private client = createApiClient(accountContract);

  async getProfile(): Promise<AccountProfile> {
    const response = await this.client.getProfile();
    if (response.status === 200) return response.body;
    throw new Error(`Failed to load the account (status ${response.status})`);
  }

  /**
   * Correct the name and phone number. Nothing here is a refusal the form can
   * act on — the fields are validated before they are sent, and a 401 means the
   * session is gone, which the guards handle — so anything but a 200 throws.
   */
  async updateProfile(
    request: UpdateAccountProfileRequest,
  ): Promise<AccountProfile> {
    const response = await this.client.updateProfile({ body: request });
    if (response.status === 200) return response.body;
    throw new Error(`Failed to save the account (status ${response.status})`);
  }

  /**
   * Delete this account (FR-AUTH-06). Two of the refusals are the form's to
   * show — a mistyped password, and the last admin, which is a real answer
   * rather than a fault — so they come back as results; anything else throws.
   */
  async deleteAccount(password: string): Promise<DeleteAccountResult> {
    const response = await this.client.deleteAccount({ body: { password } });
    if (response.status === 200) return 'ok';
    if (response.status === 400) return 'wrong-password';
    if (response.status === 409) return 'last-admin';
    throw new Error(`Failed to delete the account (status ${response.status})`);
  }
}
