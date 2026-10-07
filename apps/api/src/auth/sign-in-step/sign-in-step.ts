import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import {
  CodeSent as CodeSentAnswer,
  formatPhone,
  PhoneConfig,
  SignInStep as StepAnswer,
  SignInStepConfig,
} from '@b2b-catalog-platform/shared';
import {
  PHONE_INPUT,
  PHONE_RULE,
  PhoneRule,
} from '../../config/deployment-config';
import { UserRow, UsersService } from '../../users/users.service';
import { sessionCookieAttributes } from '../session-cookie';
import {
  CODE_DELIVERY,
  CodeDelivery,
  CodeDeliveryError,
} from './code-delivery';
import {
  CodeCheck,
  CodeResendLimitError,
  CodeSent,
  SignInCodes,
} from './sign-in-codes';

export const SIGN_IN_STEP_CONFIG = 'SIGN_IN_STEP_CONFIG';
export const SIGN_IN_STEP_SECRET = 'SIGN_IN_STEP_SECRET';

/** The httpOnly cookie that carries a sign-in between the password and the
 * code. It is no session: only the step's own routes read it. */
export const PENDING_COOKIE = 'sign_in_step';
const PENDING_TTL_S = 15 * 60;

/** What a sign-in owes before its session: nothing, a code to the confirmed
 * number, or a number to confirm first. */
export type StepNeed = 'none' | 'code' | 'confirm';

interface PendingClaims {
  sub: string;
  tokenVersion: number;
}

export { CodeDeliveryError, CodeResendLimitError };
export type { CodeCheck };

/**
 * The second sign-in step (FR-AUTH-12, ADR 0066): whether an account owes a
 * code, and the sign-in that waits on one.
 *
 * Between the password and the code the visitor holds a short-lived signed
 * cookie naming the account, signed with its own secret so no session check
 * can mistake it for a session. It carries the account's `tokenVersion`, so a
 * password change or a deactivation in the meantime ends it.
 */
@Injectable()
export class SignInStep {
  constructor(
    @Inject(SIGN_IN_STEP_CONFIG)
    private readonly config: SignInStepConfig | undefined,
    @Inject(SIGN_IN_STEP_SECRET) private readonly secret: string,
    @Inject(PHONE_RULE) private readonly phoneRule: PhoneRule,
    @Inject(PHONE_INPUT) private readonly phoneInput: PhoneConfig | undefined,
    private readonly jwt: JwtService,
    private readonly codes: SignInCodes,
    private readonly users: UsersService,
    @Inject(CODE_DELIVERY) private readonly delivery: CodeDelivery,
  ) {}

  /**
   * Whether this account is asked for a code at all.
   */
  asks(user: Pick<UserRow, 'role'>): boolean {
    const config = this.config;
    if (!config || config.mode === 'off') return false;
    if (!config.roles.includes(user.role)) return false;
    return true;
  }

  need(user: UserRow): StepNeed {
    if (!this.asks(user)) return 'none';
    const confirmed = Boolean(user.phone && user.phoneConfirmedAt);
    if (!confirmed) return 'confirm';
    return this.config?.mode === 'always' ? 'code' : 'none';
  }

  /**
   * Where a password has just been accepted. Answers null when no step is
   * owed, and the caller starts the session; otherwise sends the code, sets
   * the pending cookie and answers the step.
   *
   * The code goes to the account's own number, which staff set. One that
   * cannot take a code (none, not in a readable form, or refused by the
   * provider) stops the sign-in: the holder asks the shop to correct it, and
   * nobody chooses another number here.
   */
  async begin(
    user: UserRow,
    req: Request,
    res: Response,
  ): Promise<StepAnswer | null> {
    const need = this.need(user);
    if (need === 'none') return null;

    const phone = this.readablePhone(user.phone);
    if (!phone) {
      throw new CodeDeliveryError('unreachable', 'No number a code can reach');
    }
    const answer = await this.sendTo(
      user,
      phone,
      need === 'code' ? 'sign-in' : 'confirm',
    );

    const claims: PendingClaims = {
      sub: user.id,
      tokenVersion: user.tokenVersion,
    };
    const token = await this.jwt.signAsync(claims, {
      secret: this.secret,
      expiresIn: PENDING_TTL_S,
    });
    res.cookie(PENDING_COOKIE, token, {
      ...sessionCookieAttributes(req),
      maxAge: PENDING_TTL_S * 1000,
    });
    return answer;
  }

  /** The account a pending sign-in is for, or null where there is none: no
   * cookie, a stale one, or an account that changed or stopped since. */
  async pending(req: Request): Promise<UserRow | null> {
    const token = req.cookies?.[PENDING_COOKIE];
    if (typeof token !== 'string') return null;
    let claims: PendingClaims;
    try {
      claims = await this.jwt.verifyAsync<PendingClaims>(token, {
        secret: this.secret,
      });
    } catch {
      return null;
    }
    const user = await this.users.findById(claims.sub);
    if (
      !user ||
      user.status !== 'active' ||
      user.tokenVersion !== claims.tokenVersion ||
      this.need(user) === 'none'
    ) {
      return null;
    }
    return user;
  }

  async resend(user: UserRow): Promise<StepAnswer | null> {
    const sent = await this.codes.resend(user);
    return sent && this.codeStep(user, sent);
  }

  /**
   * Checks the code. A right one confirms the number it went to where that
   * was its purpose, and answers the account as it now stands.
   */
  async complete(
    user: UserRow,
    code: string,
  ): Promise<
    { result: 'ok'; user: UserRow } | Exclude<CodeCheck, { result: 'ok' }>
  > {
    const check = await this.codes.check(user.id, code);
    if (check.result !== 'ok') return check;
    const updated =
      check.purpose === 'confirm'
        ? await this.users.confirmPhone(user.id, check.phone)
        : user;
    return { result: 'ok', user: updated };
  }

  /** The sign-in is over, either way. */
  end(req: Request, res: Response): void {
    res.clearCookie(PENDING_COOKIE, sessionCookieAttributes(req));
  }

  private async sendTo(
    user: UserRow,
    phone: string,
    purpose: 'sign-in' | 'confirm',
  ): Promise<StepAnswer> {
    return this.codeStep(user, await this.codes.issue(user, phone, purpose));
  }

  private codeStep(user: UserRow, sent: CodeSent): StepAnswer {
    return {
      step: 'code',
      ...this.sent(user, sent),
      confirming: this.need(user) === 'confirm',
    };
  }

  /** Where a code went and when another may be asked, as a screen shows it. */
  private sent(user: UserRow, sent: CodeSent): CodeSentAnswer {
    const phone = maskPhone(formatPhone(sent.phone, this.phoneInput));
    return {
      sentTo: this.delivery.channel === 'email' ? maskEmail(user.email) : phone,
      phone,
      resendIn: Math.ceil(sent.resendInMs / 1000),
    };
  }

  /** The stored number, where a code can be sent to it as it stands. */
  private readablePhone(phone: string | null): string | null {
    return phone && this.phoneRule(phone) === phone ? phone : null;
  }
}

/**
 * Hides all but the country code and the last two digits, keeping the
 * grouping: enough for the holder to recognise their number, not enough to
 * learn someone else's from a password alone.
 */
export function maskPhone(formatted: string): string {
  const country = /^\+\d+\s/.exec(formatted)?.[0] ?? '';
  const rest = formatted.slice(country.length);
  const digits = rest.replace(/\D/g, '').length;
  let seen = 0;
  return (
    country +
    rest.replace(/\d/g, (digit) => (++seen > digits - 2 ? digit : '•'))
  );
}

/** The first letter of the mailbox and the whole domain. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  return `${email[0]}•••${email.slice(at)}`;
}
