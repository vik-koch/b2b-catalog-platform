import { inject, Injectable } from '@angular/core';
import { usersContract } from '../contract-routes.generated';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { createOrpcClient } from '../../../platform/orpc-client';
import { renderable } from '../../platform/renderable';
import { WorkRefresh } from '../../../platform/work-refresh';
import {
  AccountDeletionReason,
  CreateUserRequest,
  StaffUser,
  UpdateUserRequest,
} from '@b2b-catalog-platform/shared/core/accounts';
import {
  ConsentRecord,
  ListUsersQuery,
  UserErrorCode,
} from '@b2b-catalog-platform/shared/admin/accounts';

/**
 * The refusals a screen words: the account codes, plus the two a manager is
 * refused by name next to a field. The guards' `insufficient-role` throws.
 */
export type UserActionError =
  UserErrorCode | 'role-change-admin-only' | 'staff-create-admin-only';

export type UserActionResult =
  { ok: true; user: StaffUser } | { ok: false; code: UserActionError };

/** For the actions that answer with no row. */
export type UserDoneResult =
  { ok: true } | { ok: false; code: UserActionError };

/** Declared refusals come back as codes; anything else throws. */
@Injectable({ providedIn: 'root' })
export class StaffUsersService {
  private readonly client = createOrpcClient(usersContract);
  private readonly work = inject(WorkRefresh);

  private async settle<T, TError extends Error>(
    call: ClientPromiseResult<T, TError>,
  ): Promise<{ ok: true; data: T } | { ok: false; code: UserActionError }> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true, data: result.data };
  }

  private async act<TError extends Error>(
    call: ClientPromiseResult<StaffUser, TError>,
  ): Promise<UserActionResult> {
    const result = await this.settle(call);
    return result.ok ? { ok: true, user: result.data } : result;
  }

  private async done<TError extends Error>(
    call: ClientPromiseResult<unknown, TError>,
  ): Promise<UserDoneResult> {
    const result = await this.settle(call);
    return result.ok ? { ok: true } : result;
  }

  async list(query: ListUsersQuery = {}): Promise<StaffUser[]> {
    return (await this.client.listUsers({ query })).users;
  }

  /** `null` is the base list. Sends the invitation. */
  async approve(id: string, tierId: string | null): Promise<UserActionResult> {
    const result = await this.act(
      this.client.approveUser({ params: { id }, body: { tierId } }),
    );
    // The navbar's work marker counts pending registrations.
    void this.work.refresh();
    return result;
  }

  /** `undefined` for a 404: unknown, or staff seen by a manager. */
  async get(id: string): Promise<StaffUser | undefined> {
    const result = await safe(this.client.getUser({ params: { id } }));
    if (result.isDefined && result.error.code === 'account-not-found') {
      return undefined;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** Empty for an account it cannot open. */
  async listConsents(id: string): Promise<ConsentRecord[]> {
    const result = await safe(this.client.listUserConsents({ params: { id } }));
    if (result.isDefined && result.error.code === 'account-not-found') {
      return [];
    }
    if (!result.isSuccess) throw result.error;
    return result.data.consents;
  }

  update(id: string, body: UpdateUserRequest): Promise<UserActionResult> {
    return this.act(this.client.updateUser({ params: { id }, body }));
  }

  /** Sends the invitation. */
  create(body: CreateUserRequest): Promise<UserActionResult> {
    return this.act(this.client.createUser({ body }));
  }

  /** Switched on, an account that never chose a password is `invited`. */
  setActive(id: string, active: boolean): Promise<UserActionResult> {
    return this.act(
      this.client.setUserActive({ params: { id }, body: { active } }),
    );
  }

  /** The invitation while there is no password, else the reset link. */
  sendPasswordLink(id: string): Promise<UserDoneResult> {
    return this.done(this.client.sendPasswordLink({ params: { id } }));
  }

  /** Declines and purges a pending registration. */
  async remove(id: string): Promise<UserDoneResult> {
    const result = await this.done(this.client.deleteUser({ params: { id } }));
    void this.work.refresh();
    return result;
  }

  /** On the person's request; answers with the closed row. */
  deleteOnRequest(
    id: string,
    reason: AccountDeletionReason,
  ): Promise<UserActionResult> {
    return this.act(
      this.client.deleteAccountOnRequest({ params: { id }, body: { reason } }),
    );
  }

  setSignInStepExemption(
    id: string,
    exempt: boolean,
  ): Promise<UserActionResult> {
    return this.act(
      this.client.setSignInStepExemption({ params: { id }, body: { exempt } }),
    );
  }
}
