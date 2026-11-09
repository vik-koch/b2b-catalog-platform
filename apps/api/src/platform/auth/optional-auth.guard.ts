import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { toAuthUser } from './auth-user';
import { AuthenticatedRequest } from './authenticated-request';
import { Sessions } from './sessions';

/**
 * Reads a session on a public route that shows a signed-in customer something
 * else, their tier's prices (FR-AUTH-05). Never rejects: whatever is wrong
 * with the cookie, the request is a guest's, because the catalog stays open
 * to guests and crawlers. The tier comes from the row, not the token, so a
 * re-tiering applies on the next page view.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly sessions: Sessions) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    request.pricingTierId = null;

    const session = await this.sessions.read(request);
    if (!session) return true;

    request.user = toAuthUser(session.user);
    request.pricingTierId = session.user.tierId;
    await this.sessions.renew(request, http.getResponse<Response>(), session);
    return true;
  }
}
