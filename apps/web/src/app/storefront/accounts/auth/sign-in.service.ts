import { inject, Injectable, signal } from '@angular/core';
import { safe } from '@orpc/client';
import {
  ConsentRefusalCode,
  isConsentRefusal,
} from '@b2b-catalog-platform/shared/core/site';
import { authContract } from '../contract-routes.generated';
import { createOrpcClient } from '../../../platform/orpc-client';
import { AuthService } from '../../../platform/auth/auth.service';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import {
  MAINTENANCE_REFUSED,
  PASSWORD_TOKEN_INVALID,
  PasswordRejectionCode,
  SignInStep,
} from '@b2b-catalog-platform/shared/core/accounts';
import {
  ChangePasswordRequest,
  LoginRequest,
  PasswordTokenPurpose,
  RegisterRequest,
  SetPasswordRequest,
} from '@b2b-catalog-platform/shared/storefront/accounts';

/** Why a code could not go out: refused number, no provider, or the limit. */
export type CodeSendFailure = 'unreachable' | 'unavailable' | 'limit';

const CODE_SEND_FAILURES = {
  'phone-unreachable': 'unreachable',
  'code-delivery-unavailable': 'unavailable',
  'code-resend-limit': 'limit',
} as const satisfies Record<string, CodeSendFailure>;

function isCodeSendFailure(
  code: string,
): code is keyof typeof CODE_SEND_FAILURES {
  return Object.hasOwn(CODE_SEND_FAILURES, code);
}

/** `step`: the password was right and a code is owed (see `step`). */
export type LoginResult =
  'ok' | 'step' | 'invalid' | 'closed' | 'error' | CodeSendFailure;

/** `restart`: the pending sign-in is gone; start again from the password. */
export type CodeResult =
  | { result: 'ok' | 'expired' | 'restart' | 'closed' | 'error' }
  | { result: 'wrong'; attemptsLeft: number };

/** Asking for another code or call check. */
export type SendResult = 'ok' | 'restart' | 'error' | CodeSendFailure;

/** Asking whether the call has come; `waiting`: not yet. */
export type CallResult =
  'ok' | 'waiting' | 'expired' | 'restart' | 'closed' | 'unavailable' | 'error';

export type ChangePasswordResult =
  | { result: 'ok' }
  | { result: 'wrong-current' }
  /** The policy refused the new password; the code names the rule. */
  | { result: 'rejected'; code: PasswordRejectionCode }
  | { result: 'error' };

/**
 * Everything that leads to a session or changes its password: registering,
 * the password links, the sign-in and the step after it. The session itself
 * is AuthService's; this hands it every identity the API answers with.
 */
@Injectable({ providedIn: 'root' })
export class SignInService {
  private readonly client = createOrpcClient(authContract);
  private readonly auth = inject(AuthService);

  /** Held here, not by a page: the sign-in and set-password pages both lead
   * to it. */
  private readonly pendingStep = signal<SignInStep | null>(null);
  readonly step = this.pendingStep.asReadonly();

  /** Seconds the last "no new code yet" refusal said to wait. */
  private readonly codeWait = signal<number | null>(null);
  readonly retryAfter = this.codeWait.asReadonly();

  /** The server answers alike for a taken address; a consent refusal comes
   * back by its code. */
  async register(
    request: RegisterRequest,
  ): Promise<'ok' | 'error' | ConsentRefusalCode> {
    const result = await safe(this.client.register({ body: request }));
    if (result.isSuccess) return 'ok';
    return result.isDefined && isConsentRefusal(result.error.code)
      ? result.error.code
      : 'error';
  }

  /** The server answers alike for a known and an unknown address. */
  async forgotPassword(email: string): Promise<'ok' | 'error'> {
    const { error } = await safe(
      this.client.forgotPassword({ body: { email } }),
    );
    return error ? 'error' : 'ok';
  }

  /** Null for a link that is no good, for whatever reason; `closed` for a
   * customer's while the shop is in maintenance. */
  async checkPasswordToken(
    token: string,
  ): Promise<
    | { purpose: PasswordTokenPurpose; email: string; consentRequired: boolean }
    | 'closed'
    | null
  > {
    const result = await safe(
      this.client.checkPasswordToken({ params: { token } }),
    );
    if (result.isSuccess) return result.data;
    return result.isDefined && result.error.code === MAINTENANCE_REFUSED
      ? 'closed'
      : null;
  }

  /** Redeems the link, which signs the visitor in. */
  async setPassword(
    request: SetPasswordRequest,
  ): Promise<
    | { result: 'ok' | 'step' | 'expired' | 'closed' | 'error' }
    | { result: 'rejected'; code: PasswordRejectionCode }
    | { result: 'consent'; code: ConsentRefusalCode }
    | { result: 'code'; failure: CodeSendFailure }
  > {
    const result = await safe(this.client.setPassword({ body: request }));

    if (result.isSuccess) {
      return { result: this.signedIn(result.data) };
    }
    if (!result.isDefined) return { result: 'error' };
    const { code } = result.error;
    if (code === PASSWORD_TOKEN_INVALID) return { result: 'expired' };
    if (code === MAINTENANCE_REFUSED) return { result: 'closed' };
    if (isConsentRefusal(code)) return { result: 'consent', code };
    // Saved; only the code could not go out, so the way on is the sign-in.
    if (isCodeSendFailure(code)) {
      this.noteWait(result.error);
      return { result: 'code', failure: CODE_SEND_FAILURES[code] };
    }
    return { result: 'rejected', code };
  }

  async login(credentials: LoginRequest): Promise<LoginResult> {
    const result = await safe(this.client.login({ body: credentials }));
    if (result.isSuccess) return this.signedIn(result.data);
    // A throttle or a 5xx is not the visitor's fault, so not `invalid`.
    if (!result.isDefined) return 'error';
    const { code } = result.error;
    if (code === MAINTENANCE_REFUSED) return 'closed';
    if (!isCodeSendFailure(code)) return 'invalid';
    this.noteWait(result.error);
    return CODE_SEND_FAILURES[code];
  }

  /** `remember` asks the API to remember this browser, where offered. */
  async submitCode(code: string, remember = false): Promise<CodeResult> {
    const result = await safe(
      this.client.submitSignInCode({
        body: remember ? { code, remember } : { code },
      }),
    );
    if (result.isSuccess) {
      this.signedIn(result.data);
      return { result: 'ok' };
    }
    if (!result.isDefined) return { result: 'error' };
    const { error } = result;
    switch (error.code) {
      case 'code-wrong':
        return { result: 'wrong', attemptsLeft: error.data.attemptsLeft };
      case 'code-expired':
        return { result: 'expired' };
      case MAINTENANCE_REFUSED:
        return { result: 'closed' };
      case 'sign-in-step-expired':
        this.pendingStep.set(null);
        return { result: 'restart' };
      default:
        return { result: 'error' };
    }
  }

  /** Once the call has come the session starts, and `remember` counts. */
  async checkCall(remember = false): Promise<CallResult> {
    const result = await safe(
      this.client.checkSignInCall({ body: remember ? { remember } : {} }),
    );
    if (result.isSuccess) {
      if ('waiting' in result.data) return 'waiting';
      this.signedIn(result.data);
      return 'ok';
    }
    if (!result.isDefined) return 'error';
    switch (result.error.code) {
      case 'call-expired':
        return 'expired';
      case 'code-delivery-unavailable':
        return 'unavailable';
      case MAINTENANCE_REFUSED:
        return 'closed';
      case 'sign-in-step-expired':
        this.pendingStep.set(null);
        return 'restart';
      default:
        return 'error';
    }
  }

  /** A new code, or a new call check. */
  async resendCode(): Promise<SendResult> {
    const result = await safe(this.client.resendSignInCode());
    if (result.isSuccess) {
      this.pendingStep.set(result.data);
      return 'ok';
    }
    if (!result.isDefined) return 'error';
    const { code } = result.error;
    if (code === 'sign-in-step-expired') {
      this.pendingStep.set(null);
      return 'restart';
    }
    if (!isCodeSendFailure(code)) return 'error';
    this.noteWait(result.error);
    return CODE_SEND_FAILURES[code];
  }

  /** The server re-issues the session and answers with the identity. */
  async changePassword(
    request: ChangePasswordRequest,
  ): Promise<ChangePasswordResult> {
    const result = await safe(this.client.changePassword({ body: request }));

    if (result.isSuccess) {
      this.auth.start(result.data);
      return { result: 'ok' };
    }
    if (!result.isDefined) return { result: 'error' };

    const { code } = result.error;
    if (code === 'wrong-current-password') return { result: 'wrong-current' };
    // The session refusals reach a redirect, not this form.
    if (code === 'not-authenticated' || code === 'insufficient-role') {
      return { result: 'error' };
    }
    return { result: 'rejected', code };
  }

  /** Keeps the wait a "no new code yet" refusal names; any other clears it. */
  private noteWait(error: unknown): void {
    const { code, data } = error as {
      code: string;
      data?: { retryAfter?: number };
    };
    this.codeWait.set(
      code === 'code-resend-limit' ? (data?.retryAfter ?? null) : null,
    );
  }

  /** Both sign-in routes answer a session or the step before one. */
  private signedIn(answer: AuthUser | SignInStep): 'ok' | 'step' {
    if ('step' in answer) {
      this.pendingStep.set(answer);
      return 'step';
    }
    this.pendingStep.set(null);
    this.auth.start(answer);
    return 'ok';
  }
}
