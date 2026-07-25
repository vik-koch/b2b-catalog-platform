import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './authenticated-request';
import { Roles } from './roles.decorator';

/**
 * Server-side role enforcement (NFR-SEC-04). Runs after JwtAuthGuard, which
 * populates `request.user`. A route with no `@Roles` (or an empty list) passes
 * for any authenticated user; a non-empty list narrows access to those roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride(Roles, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // No user here means RolesGuard was applied without JwtAuthGuard in front —
    // a route misconfiguration. Fail closed rather than silently allow.
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
