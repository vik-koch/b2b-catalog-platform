import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { UserRow } from '../users/users.service';
import { JwtPayload } from './jwt-payload';
import { issueSession } from './session-cookie';

export const SESSION_IDLE_DAYS = 'SESSION_IDLE_DAYS';

const DAY_S = 24 * 60 * 60;

/**
 * Starts sessions and keeps them going (FR-AUTH-12). A session ends after
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
  ) {
    this.lifetimeS = idleDays * DAY_S;
  }

  /** Sign a token for the account and set it, with its hint, on the response. */
  async start(req: Request, res: Response, user: UserRow): Promise<void> {
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
}
