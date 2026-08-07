import { Controller, UnauthorizedException } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import {
  AccountProfile,
  accountContract,
  AuthUser,
} from '@b2b-catalog-platform/shared';
import { AuditLogger } from '../audit/audit.logger';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserRow, UsersService } from '../users/users.service';

/** The account holder's own view of their row — never the tier (ADR 0031). */
function toAccountProfile(user: UserRow): AccountProfile {
  return {
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    customerType: user.customerType,
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
    private readonly audit: AuditLogger,
  ) {}

  @TsRestHandler(accountContract.getProfile, { validateResponses: true })
  getProfile(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(accountContract.getProfile, async () => {
      const user = await this.users.findById(actor.id);
      // The guard read this row a moment ago, so this is the account deleting
      // itself mid-request rather than a real 404 — the session is what is
      // gone, and 401 is what the client already knows how to handle.
      if (!user) throw new UnauthorizedException('Session no longer valid');

      return { status: 200 as const, body: toAccountProfile(user) };
    });
  }

  @TsRestHandler(accountContract.updateProfile, { validateResponses: true })
  updateProfile(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(accountContract.updateProfile, async ({ body }) => {
      const updated = await this.users.updateOwnProfile(actor.id, body);
      // No row means the account stopped being `active` between the guard and
      // the write — deactivated or anonymized underneath the session.
      if (!updated) throw new UnauthorizedException('Session no longer valid');

      // Its own action rather than `user.updated`: what an auditor asks about a
      // changed phone number is whether staff changed it or the customer did,
      // and the two stay greppable apart only if they are named apart.
      this.audit.record('account.updated', actor, { id: updated.id });

      return { status: 200 as const, body: toAccountProfile(updated) };
    });
  }
}
