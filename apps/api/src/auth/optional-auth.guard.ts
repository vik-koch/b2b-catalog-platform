import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { AUTH_COOKIE } from './auth.constants';
import { AuthenticatedRequest } from './authenticated-request';
import { JwtPayload } from './jwt-payload';

/**
 * Session lookup for **public** routes that show something different to a
 * signed-in customer — today, tier prices (FR-AUTH-05). It never rejects: a
 * request with no cookie, a forged one, an expired one or one whose account has
 * since changed is simply anonymous, because the catalog has to stay open to
 * guests and crawlers.
 *
 * A request without the cookie does no work at all — no verification, no query
 * — so guest and crawler traffic costs exactly what it did before this existed.
 * Only a request that actually carries a session pays the one indexed lookup.
 *
 * That lookup is deliberate rather than reading the tier from the token: a
 * token lives seven days, so a claim would keep serving a customer their old
 * prices for a week after staff re-tiered them. Prices are not something to be
 * stale about.
 *
 * The validity rules below (signature, user still exists, `tokenVersion` still
 * matches) must stay in step with JwtAuthGuard — same question, different
 * answer when it fails. Anything added there belongs here too.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.pricingTierId = null;

    const token = request.cookies?.[AUTH_COOKIE];
    if (!token) return true;

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      return true;
    }

    const user = await this.users.findById(payload.sub);
    if (!user) return true;
    if (user.tokenVersion !== payload.tokenVersion) return true;

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
    // From the database row, not the token, so a re-tiering takes effect on the
    // customer's next page view.
    request.pricingTierId = user.tierId;
    return true;
  }
}
