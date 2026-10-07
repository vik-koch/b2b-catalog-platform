import { createHash } from 'node:crypto';
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

/** The httpOnly cookie that lets a browser skip the code, never the password.
 * Survives signing out and password changes; see `remember`. */
export const REMEMBERED_COOKIE = 'remembered_browser';
const DAY_S = 24 * 60 * 60;

/** What a sign-in owes before its session: nothing, a code to the confirmed
 * number, or a number to confirm first. */
export type StepNeed = 'none' | 'code' | 'confirm';

interface PendingClaims {
  sub: string;
  tokenVersion: number;
}

interface RememberedClaims {
  sub: string;
  /** When it was issued, in milliseconds: a token's own `iat` counts whole
   * seconds, too coarse to compare with `devicesTrustedSince`. */
  at: number;
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
  /** Its own key, so a remembered browser is neither a pending sign-in nor a
   * session. */
  private readonly rememberSecret: string;

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
  ) {
    this.rememberSecret = createHash('sha256')
      .update(`remembered-browser:${secret}`)
      .digest('hex');
  }

  /**
   * Whether this account is asked for a code at all: the deployment asks its
   * role, and no admin exempted it. An exemption counts only while the role
   * may be exempted, so narrowing that list ends every one of them at once.
   */
  asks(user: Pick<UserRow, 'role' | 'signInStepExemptAt'>): boolean {
    const config = this.config;
    if (!config || config.mode === 'off') return false;
    if (!config.roles.includes(user.role)) return false;
    return !(user.signInStepExemptAt && this.mayExempt(user.role));
  }

  /** Whether an admin may exempt an account of this role. */
  mayExempt(role: UserRow['role']): boolean {
    const config = this.config;
    return (
      !!config &&
      config.mode !== 'off' &&
      config.roles.includes(role) &&
      (config.exemptableRoles ?? []).includes(role)
    );
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
    // A remembered browser skips a sign-in code. A number still to be
    // confirmed cannot have one: changing it forgot them all.
    if (need === 'code' && (await this.remembered(req, user))) return null;

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

  /**
   * How long the code screen offers to remember the browser, in days; 0 hides
   * the box. Offered only at `always`: under `once` there is no next code to
   * skip.
   */
  rememberDays(): number {
    const config = this.config;
    return config?.mode === 'always' ? (config.trustDeviceDays ?? 0) : 0;
  }

  /**
   * The person ticked the box with the right code. The cookie names only the
   * account and when it was set: it is not checked against `tokenVersion`, so
   * signing out and changing the password leave it standing, and only a moved
   * `devicesTrustedSince` (a changed number, a disabled or anonymized
   * account) ends it.
   */
  async remember(req: Request, res: Response, user: UserRow): Promise<void> {
    const days = this.rememberDays();
    if (days <= 0) return;
    const claims: RememberedClaims = { sub: user.id, at: Date.now() };
    const token = await this.jwt.signAsync(claims, {
      secret: this.rememberSecret,
      expiresIn: days * DAY_S,
    });
    res.cookie(REMEMBERED_COOKIE, token, {
      ...sessionCookieAttributes(req),
      maxAge: days * DAY_S * 1000,
    });
  }

  /** Whether this browser was remembered for this account, and still is. */
  private async remembered(req: Request, user: UserRow): Promise<boolean> {
    if (this.rememberDays() <= 0) return false;
    const token = req.cookies?.[REMEMBERED_COOKIE];
    if (typeof token !== 'string') return false;
    let claims: RememberedClaims;
    try {
      claims = await this.jwt.verifyAsync<RememberedClaims>(token, {
        secret: this.rememberSecret,
      });
    } catch {
      return false;
    }
    if (claims.sub !== user.id) return false;
    const forgotten = user.devicesTrustedSince?.getTime() ?? 0;
    return claims.at > forgotten;
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
      rememberDays: this.rememberDays(),
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
