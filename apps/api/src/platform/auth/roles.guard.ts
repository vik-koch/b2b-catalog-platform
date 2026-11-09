import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedRequest } from './authenticated-request';
import { Roles } from './roles.decorator';

/** Role enforcement (NFR-SEC-04), after JwtAuthGuard. No roles listed: any
 * signed-in account passes. */
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

    // Applied without JwtAuthGuard in front: fail closed.
    if (!user) {
      throw new ForbiddenException({
        code: 'not-authenticated',
        message: 'Not authenticated',
      });
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException({
        code: 'insufficient-role',
        message: 'Insufficient role',
      });
    }

    return true;
  }
}
