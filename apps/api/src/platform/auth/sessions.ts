import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AUTH_COOKIE } from '@b2b-catalog-platform/shared/platform';
import { SESSION_USERS, SessionUser, SessionUsers } from './session-users';
import { JwtPayload } from './jwt-payload';
import { issueSession } from './session-cookie';

export const SESSION_IDLE_DAYS = 'SESSION_IDLE_DAYS';

const DAY_S = 24 * 60 * 60;

/** A session cookie that proved valid, and the row it names. */
export interface Session {
  readonly payload: JwtPayload;
  readonly user: SessionUser;
}

/**
 * Starts, reads and renews sessions (FR-AUTH-12). A session ends after
 * `session.idleDays` without use rather than a fixed time after sign-in: a
 * token in use that is more than a day old is reissued, so the clock restarts
 * at most once a day per session. `tokenVersion` still ends every session at
 * once, whatever its age.
 */
@Injectable()
export class Sessions {
  private readonly lifetimeS: number;

  constructor(
    @Inject(SESSION_IDLE_DAYS) idleDays: number,
    private readonly jwt: JwtService,
    @Inject(SESSION_USERS) private readonly users: SessionUsers,
  ) {
    this.lifetimeS = idleDays * DAY_S;
  }

  /** Sign a token for the account and set it, with its hint, on the response. */
  async start(req: Request, res: Response, user: SessionUser): Promise<void> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
    const token = await this.jwt.signAsync(payload, {
      expiresIn: this.lifetimeS,
    });
    issueSession(req, res, token, user.role, this.lifetimeS * 1000);
  }

  /**
   * The request's session, or null for none, a forged or expired token, or an
   * account that is gone, has moved its `tokenVersion` or may not sign in.
   * The token proves who; the row decides what they may do, so a demotion or
   * a deactivation counts on the next request. Without a cookie, no work.
   */
  async read(req: Request): Promise<Session | null> {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) return null;

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      return null;
    }

    const user = await this.users.find(payload.sub);
    if (!user || user.tokenVersion !== payload.tokenVersion) return null;
    return { payload, user };
  }

  /**
   * Reissues a session over a day old. A request the server renders on the
   * visitor's behalf drops the new cookie, which is harmless: the old one
   * still verifies, and the browser's own next call picks the new one up.
   */
  async renew(
    req: Request,
    res: Response | undefined,
    { payload, user }: Session,
  ): Promise<void> {
    if (!res || payload.iat === undefined) return;
    if (Date.now() / 1000 - payload.iat < DAY_S) return;
    await this.start(req, res, user);
  }
}
