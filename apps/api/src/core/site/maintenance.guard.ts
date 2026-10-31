import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { passesMaintenance } from '@b2b-catalog-platform/shared';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { MachineScope } from '../../api-tokens/machine-scope.decorator';
import { AUTH_COOKIE } from '../../auth/auth.constants';
import { AuthenticatedRequest } from '../../auth/authenticated-request';
import { JwtPayload } from '../../auth/jwt-payload';
import { Roles } from '../../auth/roles.decorator';
import { UsersService } from '../../users/users.service';
import { MaintenanceState } from './maintenance-state';
import { MAINTENANCE_EXEMPT } from './maintenance-exempt.decorator';

const RETRY_AFTER_SECONDS = 3600;

/**
 * While the shop is closed, a 503 for everyone but staff, so a route nobody
 * exempted stays hidden. Open are routes that are staff-only by their
 * `@Auth(...)` roles, machine routes and `@MaintenanceExempt()` ones, whose
 * own guards still authenticate, and any request with a staff session, so
 * staff preview the shop as it will open. A bare `@Auth()` does not count:
 * a customer's account sits behind it.
 *
 * Only a bypass, never authorization. The web's `maintenance.server.ts` gates
 * documents the same way: an exemption here usually needs one there.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly maintenance: MaintenanceState,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.maintenance.isEnabled()) {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];

    // Empty for a bare `@Auth()`.
    const roles = this.reflector.getAllAndOverride(Roles, targets);
    if (roles?.length && roles.every(passesMaintenance)) {
      return true;
    }
    // An import is often what the shop was closed to make room for.
    if (this.reflector.getAllAndOverride(MachineScope, targets) !== undefined) {
      return true;
    }
    const exempt = this.reflector.getAllAndOverride<boolean>(
      MAINTENANCE_EXEMPT,
      targets,
    );
    if (exempt) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (await this.isStaffRequest(request)) {
      return true;
    }

    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Retry-After', String(RETRY_AFTER_SECONDS));
    throw new ServiceUnavailableException('Service under maintenance');
  }

  /** Any failure means no bypass, never an error. */
  private async isStaffRequest(
    request: AuthenticatedRequest,
  ): Promise<boolean> {
    const token = request.cookies?.[AUTH_COOKIE];
    if (!token) {
      return false;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.users.findById(payload.sub);
      return (
        !!user &&
        user.tokenVersion === payload.tokenVersion &&
        passesMaintenance(user.role)
      );
    } catch {
      return false;
    }
  }
}
