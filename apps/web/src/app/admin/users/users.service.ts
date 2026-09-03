import { Injectable } from '@angular/core';
import {
  CreateUserRequest,
  ListUsersQuery,
  StaffUser,
  UpdateUserRequest,
  UserErrorCode,
} from '@b2b-catalog-platform/shared';
import { usersContract } from '../../core/contract-routes.generated';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { createOrpcClient } from '../../core/orpc-client';

/**
 * The refusals a screen renders. The account codes, plus the two a manager is
 * refused by name — those reach a form (next to the field that was refused),
 * where the guards' own `insufficient-role` reaches a redirect instead and so
 * is left to throw like any other unexpected answer.
 */
export type UserActionError =
  UserErrorCode | 'role-change-admin-only' | 'staff-create-admin-only';

/**
 * The outcome of a row action: the updated account, or the code the server
 * refused with — an approval that was already done, or a role change it would
 * not make (the last admin, or your own demotion). The wording for each code is
 * the admin text's. Only the unexpected throws.
 */
export type UserActionResult =
  { ok: true; user: StaffUser } | { ok: false; code: UserActionError };

/**
 * Every route declares the two auth refusals alongside its own, and those two
 * are not this screen's to phrase: they mean the session itself is wrong, which
 * the guards answer with a redirect. Everything else the API declares is an
 * answer to what was asked, and has a line in the admin text.
 */
function renderable(code: string): code is UserActionError {
  return code !== 'not-authenticated' && code !== 'insufficient-role';
}

/**
 * The staff account client — the counterpart to the API's StaffUsersController.
 * Same discipline as AdminCatalogService: the declared refusals (404/409) come
 * back as typed results the list can render, and only the unexpected throws.
 * Filters are applied server-side; sorting is the page's own job.
 */
@Injectable({ providedIn: 'root' })
export class StaffUsersService {
  private client = createOrpcClient(usersContract);

  /**
   * The one shape every row action shares: the account, or a code the screen
   * knows wording for. A refusal it cannot phrase is rethrown as the fault it
   * would be to show blank.
   */
  private async act<TError extends Error>(
    call: ClientPromiseResult<StaffUser, TError>,
  ): Promise<UserActionResult> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true, user: result.data };
  }

  /** The same, for the actions that answer with a message rather than a row. */
  private async confirm<TError extends Error>(
    call: ClientPromiseResult<{ message: string }, TError>,
  ): Promise<{ ok: true } | { ok: false; code: UserActionError }> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true };
  }

  /** The account list, narrowed by the grid's filters and search box. */
  async list(query: ListUsersQuery = {}): Promise<StaffUser[]> {
    return (await this.client.listUsers({ query })).users;
  }

  /** Approve a pending registration onto a tier (`null` = the base list) and
   * send its invitation. 409 when it is no longer pending (a double-click). */
  approve(id: string, tierId: string | null): Promise<UserActionResult> {
    return this.act(
      this.client.approveUser({ params: { id }, body: { tierId } }),
    );
  }

  /** One account, for the editor — which is a route, so a reload of it has no
   * list to read from. `undefined` is a 404: unknown, or staff seen by a
   * manager, which the API deliberately does not distinguish. */
  async get(id: string): Promise<StaffUser | undefined> {
    const result = await safe(this.client.getUser({ params: { id } }));
    if (result.isDefined && result.error.code === 'account-not-found') {
      return undefined;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** Save the editor's whole field set. 409 is the role guard (the last admin,
   * or your own account); 403 is a manager reaching past customers. */
  update(id: string, body: UpdateUserRequest): Promise<UserActionResult> {
    return this.act(this.client.updateUser({ params: { id }, body }));
  }

  /** Create an account and send its invitation. 409 = the email is taken. */
  create(body: CreateUserRequest): Promise<UserActionResult> {
    return this.act(this.client.createUser({ body }));
  }

  /** Switch an account off, or back on. 409 is the guard: your own account,
   * the last admin, or one that was never approved to begin with. Switching on
   * returns an `invited` account, not an `active` one — the password went with
   * the deactivation, and the API mails a fresh link. */
  setActive(id: string, active: boolean): Promise<UserActionResult> {
    return this.act(
      this.client.setUserActive({ params: { id }, body: { active } }),
    );
  }

  /** Send the set-your-password link again. 409 once a password has been
   * chosen — from there it is a password reset, not an invitation. */
  resendInvitation(
    id: string,
  ): Promise<{ ok: true } | { ok: false; code: UserActionError }> {
    return this.confirm(this.client.resendInvitation({ params: { id } }));
  }

  /** Decline and purge a pending registration. 409 when it is no longer
   * pending (an approved account is anonymized, never deleted). */
  remove(
    id: string,
  ): Promise<{ ok: true } | { ok: false; code: UserActionError }> {
    return this.confirm(this.client.deleteUser({ params: { id } }));
  }
}
