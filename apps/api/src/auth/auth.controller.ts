import { Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Implement, implement } from '@orpc/nest';
import {
  authContract,
  AuthUser,
  MAINTENANCE_REFUSED,
  PASSWORD_TOKEN_INVALID,
  passesMaintenance,
  UserRole,
} from '@b2b-catalog-platform/shared';
import {
  AuthThrottle,
  PublicFormThrottle,
} from '../throttling/throttle-presets';
import { Auth } from './auth.decorator';
import { CurrentUser } from './current-user.decorator';
import { AuthService, WrongCurrentPasswordError } from './auth.service';
import { PasswordRejectedError } from './password-policy';
import { PasswordResetService } from './password-reset.service';
import { PasswordSetupService } from './password-setup.service';
import { RegistrationService } from './registration.service';
import { MaintenanceExempt } from '../settings/maintenance-exempt.decorator';
import { SettingsService } from '../settings/settings.service';
import { refusals } from '../orpc/refusals';
import { endSession, issueSession } from './session-cookie';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registration: RegistrationService,
    private readonly passwordSetup: PasswordSetupService,
    private readonly passwordReset: PasswordResetService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Whether this account is kept out by maintenance mode. The routes below are
   * exempt from the gate so staff can get in; a customer is only turned away
   * once their credentials or link have said whose account it is.
   */
  private closedTo(role: UserRole): boolean {
    return this.settings.isMaintenanceEnabled() && !passesMaintenance(role);
  }

  // Not maintenance-exempt, unlike login: while the storefront is down there is
  // nothing to register for, and the admin who needs to get in already can.
  @PublicFormThrottle()
  @Implement(authContract.register)
  register() {
    return (
      implement(authContract.register)
        // The company-id format rule and the consent refusals are raised by
        // the service.
        .use(refusals)
        .handler(async ({ input: { body } }) => {
          await this.registration.register(body);
          // The same answer for a new address, a known one and a honeypot hit —
          // the response must not reveal which addresses have accounts.
          return { ok: true as const };
        })
    );
  }

  /**
   * Maintenance-exempt and throttled, like login: somebody locked out while the
   * storefront is down still needs the way back in, and an unauthenticated form
   * that sends mail is exactly what a rate limit is for.
   */
  @MaintenanceExempt()
  @AuthThrottle()
  @Implement(authContract.forgotPassword)
  forgotPassword() {
    return implement(authContract.forgotPassword).handler(
      async ({ input: { body } }) => {
        await this.passwordReset.request(body.email);
        // Uniform by design — see the contract.
        return { ok: true as const };
      },
    );
  }

  /**
   * The link's own endpoint, so the page can tell "choose your password" from
   * "reset your password" — and show an expired link an honest message instead
   * of a form that will fail. Throttled: a token is a secret in a URL.
   */
  @MaintenanceExempt()
  @AuthThrottle()
  @Implement(authContract.checkPasswordToken)
  checkPasswordToken() {
    return implement(authContract.checkPasswordToken).handler(
      async ({ input: { params }, errors }) => {
        const account = await this.passwordSetup.describe(params.token);
        if (!account) {
          throw errors[PASSWORD_TOKEN_INVALID]({
            message: 'This link is no longer valid',
          });
        }
        if (this.closedTo(account.role)) {
          throw errors[MAINTENANCE_REFUSED]({
            message: 'Service under maintenance',
          });
        }
        return {
          purpose: account.purpose,
          email: account.email,
          consentRequired: account.consentRequired,
        };
      },
    );
  }

  @MaintenanceExempt()
  @AuthThrottle()
  @Implement(authContract.setPassword)
  setPassword(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return (
      implement(authContract.setPassword)
        // The consent refusals are raised by the service.
        .use(refusals)
        .handler(async ({ input: { body }, errors }) => {
          // Before the link is spent, so it still works once the shop opens.
          const account = await this.passwordSetup.describe(body.token);
          if (account && this.closedTo(account.role)) {
            throw errors[MAINTENANCE_REFUSED]({
              message: 'Service under maintenance',
            });
          }
          let user;
          try {
            user = await this.passwordSetup.redeem(
              body.token,
              body.password,
              body.consentVersion,
            );
          } catch (error) {
            // Which rule refused; the link is untouched, so the visitor can
            // simply try a different password.
            if (error instanceof PasswordRejectedError) {
              throw errors[error.code]({ message: error.message });
            }
            throw error;
          }
          if (!user) {
            throw errors[PASSWORD_TOKEN_INVALID]({
              message: 'This link is no longer valid',
            });
          }
          // Straight into a session: they have just proved control of the address
          // and chosen the password, so asking them to log in would be ceremony.
          await this.auth.recordSignIn(user);
          const token = await this.auth.signToken(user);
          issueSession(req, res, token, user.role);
          return this.auth.toAuthUser(user);
        })
    );
  }

  @MaintenanceExempt()
  @AuthThrottle()
  @Implement(authContract.login)
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return implement(authContract.login).handler(
      async ({ input: { body }, errors }) => {
        const user = await this.auth.validate(body.email, body.password);
        if (!user) {
          // One answer for unknown email and wrong password alike — don't
          // reveal which emails exist (the service also equalizes timing).
          throw errors['invalid-credentials']({
            message: 'Invalid email or password',
          });
        }
        if (this.closedTo(user.role)) {
          throw errors[MAINTENANCE_REFUSED]({
            message: 'Service under maintenance',
          });
        }
        await this.auth.recordSignIn(user);
        const token = await this.auth.signToken(user);
        issueSession(req, res, token, user.role);
        return this.auth.toAuthUser(user);
      },
    );
  }

  @MaintenanceExempt()
  @Implement(authContract.logout)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return implement(authContract.logout).handler(async () => {
      endSession(req, res);
      return { message: 'Logged out' };
    });
  }

  // Exempt so a customer's session still says who it is while the shop is
  // closed: it reveals nothing of the shop, and the web gate needs it to tell
  // staff from customers.
  @MaintenanceExempt()
  @Auth()
  @Implement(authContract.me)
  me(@CurrentUser() user: AuthUser) {
    return implement(authContract.me).handler(async () => user);
  }

  @Auth()
  @Implement(authContract.changePassword)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return implement(authContract.changePassword).handler(
      async ({ input: { body }, errors }) => {
        let updated;
        try {
          updated = await this.auth.changePassword(
            user.id,
            body.currentPassword,
            body.newPassword,
          );
        } catch (error) {
          // Both are 400s, and the client has to tell them apart: one means
          // "retype the field above", the other says which rule refused the
          // new password.
          if (error instanceof WrongCurrentPasswordError) {
            throw errors['wrong-current-password']({
              message: 'Current password is incorrect',
            });
          }
          if (error instanceof PasswordRejectedError) {
            throw errors[error.code]({ message: error.message });
          }
          throw error;
        }
        // Update token so the user is not logged out.
        const token = await this.auth.signToken(updated);
        issueSession(req, res, token, updated.role);
        return this.auth.toAuthUser(updated);
      },
    );
  }
}
