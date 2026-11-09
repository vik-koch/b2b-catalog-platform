import { Controller, Req, Res } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import type { Request, Response } from 'express';

import {
  AuthUser,
  sessionContract,
} from '@b2b-catalog-platform/shared/platform';

import { Auth } from './auth.decorator';
import { CurrentUser } from './current-user.decorator';
import { endSession } from './session-cookie';
import { SessionRoute } from './session-route.decorator';

/** The session every audience shares: who it is, and ending it. */
@SessionRoute()
@Controller()
export class SessionController {
  // Leaves a remembered browser standing: signing out ends the session, and
  // the next sign-in on this browser still takes the password.
  @Implement(sessionContract.logout)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return implement(sessionContract.logout).handler(async () => {
      endSession(req, res);
      return { message: 'Logged out' };
    });
  }

  @Auth()
  @Implement(sessionContract.me)
  me(@CurrentUser() user: AuthUser) {
    return implement(sessionContract.me).handler(async () => user);
  }
}
