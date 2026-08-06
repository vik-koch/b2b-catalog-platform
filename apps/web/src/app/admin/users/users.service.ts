import { Injectable } from '@angular/core';
import {
  CreateUserRequest,
  ListUsersQuery,
  StaffUser,
  UpdateUserRequest,
  usersContract,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../../core/api-client';

/**
 * The outcome of a row action: the updated account, or a message the server
 * refused with that is worth showing verbatim — an approval that was already
 * done, or a role change the server would not make (the last admin, or your own
 * demotion). Only the unexpected throws.
 */
export type UserActionResult =
  | { ok: true; user: StaffUser }
  | { ok: false; message: string };

/**
 * The staff account client — the counterpart to the API's StaffUsersController.
 * Same discipline as AdminCatalogService: the declared refusals (404/409) come
 * back as typed results the list can render, and only the unexpected throws.
 * Filters are applied server-side; sorting is the page's own job.
 */
@Injectable({ providedIn: 'root' })
export class StaffUsersService {
  private client = createApiClient(usersContract);

  /** The account list, narrowed by the grid's filters and search box. */
  async list(query: ListUsersQuery = {}): Promise<StaffUser[]> {
    const response = await this.client.listUsers({ query });
    if (response.status === 200) return response.body.users;
    throw new Error(`Failed to list accounts (status ${response.status})`);
  }

  /** Approve a pending registration onto a tier (`null` = the base list) and
   * send its invitation. 409 when it is no longer pending (a double-click). */
  async approve(id: string, tierId: string | null): Promise<UserActionResult> {
    const response = await this.client.approveUser({
      params: { id },
      body: { tierId },
    });
    if (response.status === 200) return { ok: true, user: response.body };
    if (response.status === 404 || response.status === 409) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to approve account (status ${response.status})`);
  }

  /** One account, for the editor — which is a route, so a reload of it has no
   * list to read from. `undefined` is a 404: unknown, or staff seen by a
   * manager, which the API deliberately does not distinguish. */
  async get(id: string): Promise<StaffUser | undefined> {
    const response = await this.client.getUser({ params: { id } });
    if (response.status === 200) return response.body;
    if (response.status === 404) return undefined;
    throw new Error(`Failed to load account (status ${response.status})`);
  }

  /** Save the editor's whole field set. 409 is the role guard (the last admin,
   * or your own account); 403 is a manager reaching past customers. */
  async update(id: string, body: UpdateUserRequest): Promise<UserActionResult> {
    const response = await this.client.updateUser({ params: { id }, body });
    if (response.status === 200) return { ok: true, user: response.body };
    if (
      response.status === 403 ||
      response.status === 404 ||
      response.status === 409
    ) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to save the account (status ${response.status})`);
  }

  /** Create an account and send its invitation. 409 = the email is taken. */
  async create(body: CreateUserRequest): Promise<UserActionResult> {
    const response = await this.client.createUser({ body });
    if (response.status === 201) return { ok: true, user: response.body };
    if (response.status === 403 || response.status === 409) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to create the account (status ${response.status})`);
  }

  /** Switch an account off, or back on. 409 is the guard: your own account,
   * the last admin, or one that was never approved to begin with. Switching on
   * returns an `invited` account, not an `active` one — the password went with
   * the deactivation, and the API mails a fresh link. */
  async setActive(id: string, active: boolean): Promise<UserActionResult> {
    const response = await this.client.setUserActive({
      params: { id },
      body: { active },
    });
    if (response.status === 200) return { ok: true, user: response.body };
    if (response.status === 404 || response.status === 409) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to change the status (status ${response.status})`);
  }

  /** Send the set-your-password link again. 409 once a password has been
   * chosen — from there it is a password reset, not an invitation. */
  async resendInvitation(
    id: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const response = await this.client.resendInvitation({
      params: { id },
      body: {},
    });
    if (response.status === 200) return { ok: true };
    if (response.status === 404 || response.status === 409) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(
      `Failed to send the invitation (status ${response.status})`,
    );
  }

  /** Decline and purge a pending registration. 409 when it is no longer
   * pending (an approved account is anonymized, never deleted). */
  async remove(
    id: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const response = await this.client.deleteUser({
      params: { id },
      body: undefined,
    });
    if (response.status === 200) return { ok: true };
    if (response.status === 404 || response.status === 409) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to decline account (status ${response.status})`);
  }
}
