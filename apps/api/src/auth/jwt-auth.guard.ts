import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authUserSchema } from '@b2b-catalog-platform/shared';
import { AUTH_COOKIE } from './auth.constants';
import { AuthenticatedRequest } from './authenticated-request';
import { JwtPayload } from './jwt-payload';

/**
 * Authenticates a request from the httpOnly session cookie. On success it
 * populates `request.user`; otherwise it fails with 401. Signing key and expiry
 * come from the JwtModule registration in AuthModule, so this guard stays
 * configuration-agnostic.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

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

    // A token signed with our key but carrying an unexpected claim shape is
    // still rejected before anything downstream trusts it.
    const parsed = authUserSchema.safeParse({
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    });
    if (!parsed.success) {
      throw new UnauthorizedException('Invalid session');
    }

    request.user = parsed.data;
    return true;
  }
}
