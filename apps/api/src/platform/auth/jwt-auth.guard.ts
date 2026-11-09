import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

import { toAuthUser } from './auth-user';
import { AuthenticatedRequest } from './authenticated-request';
import { Sessions } from './sessions';

/** Requires a session, and puts its account on the request. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly sessions: Sessions) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();

    const session = await this.sessions.read(request);
    if (!session) {
      throw new UnauthorizedException({
        code: 'not-authenticated',
        message: 'Not authenticated',
      });
    }

    request.user = toAuthUser(session.user);
    await this.sessions.renew(request, http.getResponse<Response>(), session);
    return true;
  }
}
