import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { AUTH_COOKIE } from './auth.constants';
import { toAuthUser } from './auth-user';
import { AuthenticatedRequest } from './authenticated-request';
import { JwtPayload } from './jwt-payload';

/**
 * Authenticates a request from the httpOnly session cookie. The token proves
 * *identity* (its signature is tamper-proof); the database is the source of
 * truth for *authorization*. So after verifying the signature we load the user
 * and use the DB row — a deleted or demoted user is rejected on the next
 * request rather than staying valid until the token expires, and a tokenVersion
 * mismatch (e.g. after a password change) invalidates the session too.
 *
 * The cost is one indexed lookup per request, only on `@Auth`-gated routes;
 * public routes never reach this guard.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = request.cookies?.[AUTH_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const user = await this.users.findById(payload.sub);
    // User gone (deleted) → reject.
    if (!user) {
      throw new UnauthorizedException('Session no longer valid');
    }
    // Version moved on (password changed / forced logout) → reject.
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session expired');
    }
    // Not (or no longer) an account that may sign in: awaiting approval, or
    // anonymized after self-deletion. Checked here as well as at login, so a
    // session already in flight when the status changes stops working too.
    if (user.status !== 'active') {
      throw new UnauthorizedException('Session no longer valid');
    }

    // Role comes from the DB, not the token, so a role change takes effect now.
    request.user = toAuthUser(user);
    return true;
  }
}
