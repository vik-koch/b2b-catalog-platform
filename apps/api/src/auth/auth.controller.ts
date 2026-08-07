import { Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import {
  authContract,
  AuthUser,
  PASSWORD_TOKEN_INVALID,
} from '@b2b-catalog-platform/shared';
import {
  AuthThrottle,
  PublicFormThrottle,
} from '../throttling/throttle-presets';
import { AUTH_COOKIE } from './auth.constants';
import { Auth } from './auth.decorator';
import { CurrentUser } from './current-user.decorator';
import { AuthService, WrongCurrentPasswordError } from './auth.service';
import { PasswordRejectedError } from './password-policy';
import { PasswordResetService } from './password-reset.service';
import { PasswordSetupService } from './password-setup.service';
import { RegistrationService } from './registration.service';
import { MaintenanceExempt } from '../settings/maintenance-exempt.decorator';
import { sessionCookie, sessionCookieAttributes } from './session-cookie';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly registration: RegistrationService,
    private readonly passwordSetup: PasswordSetupService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  // Not maintenance-exempt, unlike login: while the storefront is down there is
  // nothing to register for, and the admin who needs to get in already can.
  @PublicFormThrottle()
  @TsRestHandler(authContract.register)
  register() {
    return tsRestHandler(authContract.register, async ({ body }) => {
      await this.registration.register(body);
      // The same answer for a new address, a known one and a honeypot hit —
      // the response must not reveal which addresses have accounts.
      return { status: 200, body: { ok: true as const } };
    });
  }

  /**
   * Maintenance-exempt and throttled, like login: somebody locked out while the
   * storefront is down still needs the way back in, and an unauthenticated form
   * that sends mail is exactly what a rate limit is for.
   */
  @MaintenanceExempt()
  @AuthThrottle()
  @TsRestHandler(authContract.forgotPassword)
  forgotPassword() {
    return tsRestHandler(authContract.forgotPassword, async ({ body }) => {
      await this.passwordReset.request(body.email);
      // Uniform by design — see the contract.
      return { status: 200, body: { ok: true as const } };
    });
  }

  /**
   * The link's own endpoint, so the page can tell "choose your password" from
   * "reset your password" — and show an expired link an honest message instead
   * of a form that will fail. Throttled: a token is a secret in a URL.
   */
  @MaintenanceExempt()
  @AuthThrottle()
  @TsRestHandler(authContract.checkPasswordToken)
  checkPasswordToken() {
    return tsRestHandler(
      authContract.checkPasswordToken,
      async ({ params }) => {
        const account = await this.passwordSetup.describe(params.token);
        return account
          ? { status: 200 as const, body: account }
          : {
              status: 404 as const,
              body: {
                code: PASSWORD_TOKEN_INVALID,
                message: 'This link is no longer valid',
              },
            };
      },
    );
  }

  @MaintenanceExempt()
  @AuthThrottle()
  @TsRestHandler(authContract.setPassword)
  setPassword(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return tsRestHandler(authContract.setPassword, async ({ body }) => {
      let user;
      try {
        user = await this.passwordSetup.redeem(body.token, body.password);
      } catch (error) {
        // Which rule refused; the link is untouched, so the visitor can simply
        // try a different password.
        if (error instanceof PasswordRejectedError) {
          return {
            status: 400 as const,
            body: { code: error.code, message: error.message },
          };
        }
        throw error;
      }
      if (!user) {
        return {
          status: 404,
          body: {
            code: PASSWORD_TOKEN_INVALID,
            message: 'This link is no longer valid',
          },
        };
      }
      // Straight into a session: they have just proved control of the address
      // and chosen the password, so asking them to log in would be ceremony.
      const token = await this.auth.signToken(user);
      res.cookie(AUTH_COOKIE, token, sessionCookie(req));
      return { status: 200, body: this.auth.toAuthUser(user) };
    });
  }

  @MaintenanceExempt()
  @AuthThrottle()
  @TsRestHandler(authContract.login)
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return tsRestHandler(authContract.login, async ({ body }) => {
      const user = await this.auth.validate(body.email, body.password);
      if (!user) {
        // One answer for unknown email and wrong password alike — don't reveal
        // which emails exist (the service also equalizes timing).
        return {
          status: 401,
          body: {
            code: 'invalid-credentials' as const,
            message: 'Invalid email or password',
          },
        };
      }
      const token = await this.auth.signToken(user);
      res.cookie(AUTH_COOKIE, token, sessionCookie(req));
      return { status: 200, body: this.auth.toAuthUser(user) };
    });
  }

  @MaintenanceExempt()
  @TsRestHandler(authContract.logout)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return tsRestHandler(authContract.logout, async () => {
      // Same attributes (minus maxAge) so the browser matches and clears it.
      res.clearCookie(AUTH_COOKIE, sessionCookieAttributes(req));
      return { status: 200, body: { message: 'Logged out' } };
    });
  }

  @Auth()
  @TsRestHandler(authContract.me)
  me(@CurrentUser() user: AuthUser) {
    return tsRestHandler(authContract.me, async () => {
      return { status: 200, body: user };
    });
  }

  @Auth()
  @TsRestHandler(authContract.changePassword)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return tsRestHandler(authContract.changePassword, async ({ body }) => {
      let updated;
      try {
        updated = await this.auth.changePassword(
          user.id,
          body.currentPassword,
          body.newPassword,
        );
      } catch (error) {
        // Both are 400s, and the client has to tell them apart: one means
        // "retype the field above", the other says which rule refused the new
        // password.
        if (error instanceof WrongCurrentPasswordError) {
          return {
            status: 400 as const,
            body: {
              code: 'wrong-current-password' as const,
              message: 'Current password is incorrect',
            },
          };
        }
        if (error instanceof PasswordRejectedError) {
          return {
            status: 400 as const,
            body: { code: error.code, message: error.message },
          };
        }
        throw error;
      }
      // Update token so the user is not logged out.
      const token = await this.auth.signToken(updated);
      res.cookie(AUTH_COOKIE, token, sessionCookie(req));
      return { status: 200, body: this.auth.toAuthUser(updated) };
    });
  }
}
