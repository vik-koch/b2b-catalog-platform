import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import type { Request, Response } from 'express';

import {
  MAINTENANCE_REFUSED,
  PASSWORD_TOKEN_INVALID,
} from '@b2b-catalog-platform/shared/core/accounts';
import { passesMaintenance } from '@b2b-catalog-platform/shared/core/site';
import { AuthUser, UserRole } from '@b2b-catalog-platform/shared/platform';
import { authContract } from '@b2b-catalog-platform/shared/storefront/accounts';

import { PasswordRejectedError } from '../../core/accounts/password-rejected-error';
import { PasswordResetService } from '../../core/accounts/password-reset.service';
import { sending } from '../../core/accounts/sign-in-step/code-refusals';
import { MailCallCheck } from '../../core/accounts/sign-in-step/mail-call-check';
import {
  SIGN_IN_PROOF,
  SignInProof,
} from '../../core/accounts/sign-in-step/sign-in-proof';
import { SignInStep } from '../../core/accounts/sign-in-step/sign-in-step';
import { UserRow, UsersService } from '../../core/accounts/users.service';
import { MaintenanceExempt } from '../../core/site/maintenance-exempt.decorator';
import { MaintenanceState } from '../../core/site/maintenance-state';
import { toAuthUser } from '../../platform/auth/auth-user';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { Sessions } from '../../platform/auth/sessions';
import { refusals } from '../../platform/orpc/refusals';
import {
  AuthThrottle,
  PublicFormThrottle,
  SignInCallThrottle,
} from '../../platform/throttling/throttle-presets';
import { AuthService } from './auth.service';
import { PasswordSetupService } from './password-setup.service';
import { RegistrationService } from './registration.service';
import { WrongCurrentPasswordError } from './wrong-current-password-error';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly registration: RegistrationService,
    private readonly passwordSetup: PasswordSetupService,
    private readonly passwordReset: PasswordResetService,
    private readonly maintenance: MaintenanceState,
    private readonly step: SignInStep,
    private readonly sessions: Sessions,
    @Inject(SIGN_IN_PROOF) private readonly proof: SignInProof,
  ) {}

  /** After an accepted password: the session, or the step before it
   * (FR-AUTH-12). */
  private async signIn(user: UserRow, req: Request, res: Response) {
    const pending = await sending(this.step.begin(user, req, res));
    if (pending) return pending;
    return this.startSession(user, req, res);
  }

  private async startSession(user: UserRow, req: Request, res: Response) {
    await this.users.recordSignIn(user.id);
    await this.sessions.start(req, res, user);
    return toAuthUser(user);
  }

  /** The routes below are exempt from the gate so staff get in; a customer
   * is turned away once credentials or a link say whose account it is. */
  private closedTo(role: UserRole): boolean {
    return this.maintenance.isEnabled() && !passesMaintenance(role);
  }

  // Not maintenance-exempt: a closed shop has nothing to register for.
  @PublicFormThrottle()
  @Implement(authContract.register)
  register() {
    return implement(authContract.register)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        await this.registration.register(body);
        // One answer for a new address, a known one and a honeypot hit.
        return { ok: true as const };
      });
  }

  @MaintenanceExempt()
  @AuthThrottle()
  @Implement(authContract.forgotPassword)
  forgotPassword() {
    return implement(authContract.forgotPassword).handler(
      async ({ input: { body } }) => {
        await this.passwordReset.request(body.email);
        return { ok: true as const };
      },
    );
  }

  /** So the page knows a first password from a reset, and an expired link
   * before the form fails. */
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
          throw errors[MAINTENANCE_REFUSED](CLOSED);
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
    return implement(authContract.setPassword)
      .use(refusals)
      .handler(async ({ input: { body }, errors }) => {
        // Before the link is spent, so it still works once the shop opens.
        const account = await this.passwordSetup.describe(body.token);
        if (account && this.closedTo(account.role)) {
          throw errors[MAINTENANCE_REFUSED](CLOSED);
        }
        let user;
        try {
          user = await this.passwordSetup.redeem(
            body.token,
            body.password,
            body.consentVersion,
          );
        } catch (error) {
          // The link is untouched: another password can be tried.
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
        // The link proved the address: straight into a session, or the step.
        return this.signIn(user, req, res);
      });
  }

  @MaintenanceExempt()
  @AuthThrottle()
  @Implement(authContract.login)
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return implement(authContract.login)
      .use(refusals)
      .handler(async ({ input: { body }, errors }) => {
        const user = await this.auth.validate(body.email, body.password);
        if (!user) {
          // One answer for an unknown address and a wrong password.
          throw errors['invalid-credentials']({
            message: 'Invalid email or password',
          });
        }
        if (this.closedTo(user.role)) {
          throw errors[MAINTENANCE_REFUSED](CLOSED);
        }
        return this.signIn(user, req, res);
      });
  }

  @MaintenanceExempt()
  @AuthThrottle()
  @Implement(authContract.resendSignInCode)
  resendSignInCode(@Req() req: Request) {
    return implement(authContract.resendSignInCode)
      .use(refusals)
      .handler(async ({ errors }) => {
        const user = await this.step.pending(req);
        const answer = user ? await sending(this.step.resend(user)) : null;
        if (!answer) throw errors['sign-in-step-expired'](STEP_EXPIRED);
        return answer;
      });
  }

  @MaintenanceExempt()
  @AuthThrottle()
  @Implement(authContract.submitSignInCode)
  submitSignInCode(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return implement(authContract.submitSignInCode).handler(
      async ({ input: { body }, errors }) => {
        const user = await this.step.pending(req);
        if (!user) throw errors['sign-in-step-expired'](STEP_EXPIRED);
        // Asked again at the end: the shop may have closed since the password.
        if (this.closedTo(user.role)) {
          throw errors[MAINTENANCE_REFUSED](CLOSED);
        }

        const outcome = await this.step.complete(user, body.code);
        if (outcome.result === 'wrong') {
          throw errors['code-wrong']({
            message: 'Wrong code',
            data: { attemptsLeft: outcome.attemptsLeft },
          });
        }
        if (outcome.result === 'expired') {
          throw errors['code-expired']({ message: 'The code has expired' });
        }
        this.step.end(req, res);
        if (body.remember) await this.step.remember(req, res, outcome.user);
        return this.startSession(outcome.user, req, res);
      },
    );
  }

  /** Polled by the call screen; once the call has come, as a right code. */
  @MaintenanceExempt()
  @SignInCallThrottle()
  @Implement(authContract.checkSignInCall)
  checkSignInCall(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return implement(authContract.checkSignInCall)
      .use(refusals)
      .handler(async ({ input: { body }, errors }) => {
        const user = await this.step.pending(req);
        if (!user) throw errors['sign-in-step-expired'](STEP_EXPIRED);
        if (this.closedTo(user.role)) {
          throw errors[MAINTENANCE_REFUSED](CLOSED);
        }

        const outcome = await sending(this.step.completeCall(user));
        if (outcome.result === 'pending') return { waiting: true as const };
        if (outcome.result === 'expired') {
          throw errors['call-expired']({ message: 'The call check is over' });
        }
        this.step.end(req, res);
        if (body.remember) await this.step.remember(req, res, outcome.user);
        return this.startSession(outcome.user, req, res);
      });
  }

  /** The stand-in mail's link (`SIGN_IN_MAIL_KIND=call`). Not a contract
   * route: a mail client opens it as a page. 404 under a real provider. */
  @MaintenanceExempt()
  @AuthThrottle()
  @Get('auth/sign-in-step/stand-in/:reference')
  answerStandInCall(
    @Param('reference') reference: string,
    @Res() res: Response,
  ) {
    const check = this.proof.kind === 'call' ? this.proof.check : null;
    if (!(check instanceof MailCallCheck) || !check.answer(reference)) {
      throw new NotFoundException();
    }
    res.redirect(303, '/');
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
        // The change ended this session too.
        await this.sessions.start(req, res, updated);
        return toAuthUser(updated);
      },
    );
  }
}

const STEP_EXPIRED = { message: 'No sign-in is waiting for a code' };
const CLOSED = { message: 'Service under maintenance' };
