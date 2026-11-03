import { Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Implement, implement } from '@orpc/nest';
import { AuditLogger } from '../../audit/audit.logger';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { endSession } from '../../platform/auth/session-cookie';
import { PHONE_RULE, PhoneRule } from '../../config/deployment-config';
import { refusals } from '../../orpc/refusals';
import { SignInStep } from '../../core/accounts/sign-in-step/sign-in-step';
import { storedPhone } from '../../core/accounts/stored-phone';
import { UserRow, UsersService } from '../../core/accounts/users.service';
import {
  ACCOUNT_ORDERS,
  AccountOrders,
} from '../../core/accounts/account-orders';
import { AccountDeletion } from '../../core/accounts/account-deletion';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import {
  AccountProfile,
  accountContract,
} from '@b2b-catalog-platform/shared/storefront/accounts';

/** The holder's own view of their row: never the tier. */
function toAccountProfile(
  user: UserRow,
  openOrders: number,
  phoneLocked: boolean,
): AccountProfile {
  return {
    openOrders,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    customerType: user.customerType,
    companyName: user.companyName,
    companyRegistrationId: user.companyRegistrationId,
    createdAt: user.createdAt.toISOString(),
    phoneLocked,
  };
}

/** The holder's own record, any role. The id is always the session's. */
@Auth()
@Controller()
export class AccountController {
  constructor(
    private readonly users: UsersService,
    @Inject(ACCOUNT_ORDERS) private readonly orders: AccountOrders,
    private readonly deletion: AccountDeletion,
    private readonly audit: AuditLogger,
    @Inject(PHONE_RULE) private readonly phoneRule: PhoneRule,
    private readonly step: SignInStep,
  ) {}

  private async profileOf(user: UserRow): Promise<AccountProfile> {
    return toAccountProfile(
      user,
      await this.orders.countOpen(user.id),
      this.step.asks(user),
    );
  }

  @Implement(accountContract.getProfile)
  getProfile(@CurrentUser() actor: AuthUser) {
    return implement(accountContract.getProfile).handler(async ({ errors }) => {
      const user = await this.users.findById(actor.id);
      // Gone since the guard read it: the session is what ended.
      if (!user) throw errors['not-authenticated']();

      return this.profileOf(user);
    });
  }

  @Implement(accountContract.updateProfile)
  updateProfile(@CurrentUser() actor: AuthUser) {
    return implement(accountContract.updateProfile)
      .use(refusals)
      .handler(async ({ input: { body }, errors }) => {
        const current = await this.users.findById(actor.id);
        if (!current) throw errors['not-authenticated']();
        const phone =
          storedPhone(this.phoneRule, body.phone, current.phone) ?? null;
        // Where the step asks this account, staff change its number
        // (FR-AUTH-12).
        if (phone !== current.phone && this.step.asks(current)) {
          throw errors['phone-locked']({
            message: 'Staff change this number',
          });
        }

        const updated = await this.users.updateOwnProfile(actor.id, {
          ...body,
          phone,
        });
        // No longer `active` since the guard read it.
        if (!updated) throw errors['not-authenticated']();

        // Not `user.updated`, so the holder's edits stay apart from staff's.
        this.audit.record('account.updated', actor, { id: updated.id });

        return this.profileOf(updated);
      });
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

        // With the actor as they were: no address is left afterwards.
        this.audit.record('account.deleted', actor, { id: actor.id });
        // Dead already; cleared so the browser stops sending it.
        endSession(req, res);

        return { message: 'Account deleted' };
      },
    );
  }
}
