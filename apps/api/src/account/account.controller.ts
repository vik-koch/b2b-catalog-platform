import { Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Implement, implement } from '@orpc/nest';
import {
  AccountProfile,
  accountContract,
  AuthUser,
} from '@b2b-catalog-platform/shared';
import { AuditLogger } from '../audit/audit.logger';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { endSession } from '../auth/session-cookie';
import { UserRow, UsersService } from '../users/users.service';
import { AccountDeletion } from './account-deletion';

/** The account holder's own view of their row — never the tier (ADR 0031). */
function toAccountProfile(user: UserRow): AccountProfile {
  return {
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    customerType: user.customerType,
    companyName: user.companyName,
    companyRegistrationId: user.companyRegistrationId,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * The account holder's own record — the self-service counterpart to
 * StaffUsersController. `@Auth()` with no roles: every signed-in account has
 * one of these, whatever it may do elsewhere.
 *
 * The id always comes from the session, never from the request, so there is no
 * "may I see this account" question to get wrong.
 */
@Auth()
@Controller()
export class AccountController {
  constructor(
    private readonly users: UsersService,
    private readonly deletion: AccountDeletion,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(accountContract.getProfile)
  getProfile(@CurrentUser() actor: AuthUser) {
    return implement(accountContract.getProfile).handler(async ({ errors }) => {
      const user = await this.users.findById(actor.id);
      // The guard read this row a moment ago, so this is the account deleting
      // itself mid-request rather than a real 404 — the session is what is
      // gone, and 401 is what the client already knows how to handle.
      if (!user) throw errors['not-authenticated']();

      return toAccountProfile(user);
    });
  }

  @Implement(accountContract.updateProfile)
  updateProfile(@CurrentUser() actor: AuthUser) {
    return implement(accountContract.updateProfile).handler(
      async ({ input: { body }, errors }) => {
        const updated = await this.users.updateOwnProfile(actor.id, body);
        // No row means the account stopped being `active` between the guard and
        // the write — deactivated or anonymized underneath the session.
        if (!updated) throw errors['not-authenticated']();

        // Its own action rather than `user.updated`: what an auditor asks about
        // a changed phone number is whether staff changed it or the customer
        // did, and the two stay greppable apart only if they are named apart.
        this.audit.record('account.updated', actor, { id: updated.id });

        return toAccountProfile(updated);
      },
    );
  }

  @Implement(accountContract.deleteAccount)
  deleteAccount(
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return implement(accountContract.deleteAccount).handler(
      async ({ input: { body }, errors }) => {
        const result = await this.deletion.delete(actor.id, body.password);

        if (!result.ok) {
          throw result.reason === 'last-admin'
            ? errors['last-admin']({
                message: 'This is the only admin account',
              })
            : errors['wrong-current-password']({
                message: 'Password is incorrect',
              });
        }

        // Audited before the cookie goes, and with the actor as they still
        // were: afterwards there is no address left to attribute it to.
        this.audit.record('account.deleted', actor, { id: actor.id });
        // The bumped tokenVersion already makes the cookie useless; clearing it
        // is what stops the browser presenting a dead session on every request.
        endSession(req, res);

        return { message: 'Account deleted' };
      },
    );
  }
}
