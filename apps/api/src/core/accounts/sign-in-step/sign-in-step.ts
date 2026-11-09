import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';

import {
  CodeSent as CodeSentAnswer,
  SignInStepConfig,
  SignInStep as StepAnswer,
} from '@b2b-catalog-platform/shared/core/accounts';
import {
  formatPhone,
  PhoneConfig,
} from '@b2b-catalog-platform/shared/platform';

import { sessionCookieAttributes } from '../../../platform/auth/session-cookie';
import {
  PHONE_INPUT,
  PHONE_RULE,
  PhoneRule,
} from '../../../platform/config/deployment-config';
import { UserRow, UsersService } from '../users.service';
import { CodeDeliveryError } from './code-delivery';
import {
  CallCheckResult,
  CodeCheck,
  CodePurpose,
  CodeSent,
  SignInCodes,
} from './sign-in-codes';
import { byMail, SIGN_IN_PROOF, SignInProof } from './sign-in-proof';

export const SIGN_IN_STEP_CONFIG = 'SIGN_IN_STEP_CONFIG';
export const SIGN_IN_STEP_SECRET = 'SIGN_IN_STEP_SECRET';

/** Carries a sign-in from the password to the step. No session: only the
 * step's routes read it. */
export const PENDING_COOKIE = 'sign_in_step';
const PENDING_TTL_S = 15 * 60;

/** Lets a browser skip the step, never the password; see `remember`. */
export const REMEMBERED_COOKIE = 'remembered_browser';
const DAY_S = 24 * 60 * 60;

/** What a sign-in owes before its session: nothing, proof of the confirmed
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

/**
 * The second sign-in step (FR-AUTH-12): whether an account owes proof of its
 * number, and the sign-in waiting on it. The pending cookie has its own
 * secret, so no session check reads it as a session, and carries the
 * `tokenVersion`, so a password change in between ends it.
 */
@Injectable()
export class SignInStep {
  /** Its own key again: neither a pending sign-in nor a session. */
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
    @Inject(SIGN_IN_PROOF) private readonly proof: SignInProof,
  ) {
    this.rememberSecret = createHash('sha256')
      .update(`remembered-browser:${secret}`)
      .digest('hex');
  }

  /** Whether the account takes the step at all. An exemption counts only
   * while its role may be exempted, so narrowing that list ends them all. */
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
   * After an accepted password: null where no step is owed, otherwise the
   * step begun and the pending cookie set. A number the step cannot use stops
   * the sign-in: staff set it, so the holder asks the shop to correct it.
   */
  async begin(
    user: UserRow,
    req: Request,
    res: Response,
  ): Promise<StepAnswer | null> {
    const need = this.need(user);
    if (need === 'none') return null;
    // A number still to be confirmed cannot have one: changing it forgot them.
    if (need === 'code' && (await this.remembered(req, user))) return null;

    const phone = this.readablePhone(user.phone);
    if (!phone) {
      throw new CodeDeliveryError('unreachable', 'No number the step can use');
    }
    const sent = await this.codes.issue(
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
    return this.codeStep(user, sent);
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

  /** A right code confirms its number where that was its purpose, and
   * answers the account as it now stands. */
  async complete(
    user: UserRow,
    code: string,
  ): Promise<
    { result: 'ok'; user: UserRow } | Exclude<CodeCheck, { result: 'ok' }>
  > {
    const check = await this.codes.check(user.id, code);
    if (check.result !== 'ok') return check;
    return { result: 'ok', user: await this.proven(user, check) };
  }

  /** As `complete`, once the call has come. Throws `CodeDeliveryError` when
   * the provider cannot tell. */
  async completeCall(
    user: UserRow,
  ): Promise<
    { result: 'ok'; user: UserRow } | Exclude<CallCheckResult, { result: 'ok' }>
  > {
    const check = await this.codes.checkCall(user.id);
    if (check.result !== 'ok') return check;
    return { result: 'ok', user: await this.proven(user, check) };
  }

  private async proven(
    user: UserRow,
    proof: { purpose: CodePurpose; phone: string },
  ): Promise<UserRow> {
    return proof.purpose === 'confirm'
      ? this.users.confirmPhone(user.id, proof.phone)
      : user;
  }

  /** Days the screen offers to remember the browser; 0 hides the box. Only
   * at `always`: under `once` there is no next step to skip. */
  rememberDays(): number {
    const config = this.config;
    return config?.mode === 'always' ? (config.trustDeviceDays ?? 0) : 0;
  }

  /** Not tied to `tokenVersion`: signing out and a new password leave it,
   * and only a moved `devicesTrustedSince` ends it. */
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

  private codeStep(user: UserRow, sent: CodeSent): StepAnswer {
    const common = {
      confirming: this.need(user) === 'confirm',
      rememberDays: this.rememberDays(),
    };
    if (!sent.call)
      return { step: 'code', ...this.sent(user, sent), ...common };
    const { phone, resendIn } = this.sent(user, sent);
    return {
      step: 'call',
      callTo: formatPhone(sent.call.callTo, this.phoneInput),
      dial: sent.call.callTo,
      expiresIn: Math.ceil(sent.call.expiresInMs / 1000),
      ...(byMail(this.proof) ? { sentTo: maskEmail(user.email) } : {}),
      phone,
      resendIn,
      ...common,
    };
  }

  /** Where a code went and when another may be asked, as a screen shows it. */
  private sent(user: UserRow, sent: CodeSent): CodeSentAnswer {
    const phone = maskPhone(formatPhone(sent.phone, this.phoneInput));
    return {
      sentTo: byMail(this.proof) ? maskEmail(user.email) : phone,
      phone,
      resendIn: Math.ceil(sent.resendInMs / 1000),
    };
  }

  /** The stored number, where a code can be sent to it as it stands. */
  private readablePhone(phone: string | null): string | null {
    return phone && this.phoneRule(phone) === phone ? phone : null;
  }
}

/** All but the country code and the last two digits, grouping kept: enough
 * to recognise one's own number, not to learn another's from a password. */
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
