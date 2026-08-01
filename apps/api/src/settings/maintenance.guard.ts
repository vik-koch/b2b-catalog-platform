import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { AUTH_COOKIE } from '../auth/auth.constants';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { JwtPayload } from '../auth/jwt-payload';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from '../users/users.service';
import { SettingsService } from './settings.service';
import { MAINTENANCE_EXEMPT } from './maintenance-exempt.decorator';

/** How long crawlers/clients are told to wait before retrying (1 hour). */
const RETRY_AFTER_SECONDS = 3600;

/**
 * Global gate for maintenance mode (FR-ADM-04, ADR 0023). The SSR tier mirrors
 * this for documents rather than API calls (see web's maintenance.server.ts);
 * an exemption added here usually needs its counterpart there. When the flag is off
 * it does nothing. When on, it answers a request with 503 unless the request is
 * exempt on one of these grounds:
 *
 *  - route-structural: the route carries `@Auth(...)` role metadata (the admin
 *    panel and its APIs), or is explicitly `@MaintenanceExempt()` (login, health
 *    probes). Those routes' own guards still enforce authentication.
 *  - identity: the request carries a valid admin session cookie, so an admin
 *    previews the live storefront exactly as it will appear at launch.
 *
 * Everything else — an anonymous visitor or crawler hitting a public route — is
 * gated. The default is therefore fail-safe: a route nobody exempted stays
 * hidden. This is only a bypass check; real authorization lives in JwtAuthGuard
 * and RolesGuard, which run afterwards on the routes that require them.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.settings.isMaintenanceEnabled()) {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];

    // Route-structural exemptions. `@Auth(...)` attaches Roles metadata (an
    // array, empty for a bare `@Auth()`); its presence means the route is
    // behind authentication and stays reachable.
    const roles = this.reflector.getAllAndOverride(Roles, targets);
    if (roles !== undefined) {
      return true;
    }
    const exempt = this.reflector.getAllAndOverride<boolean>(
      MAINTENANCE_EXEMPT,
      targets,
    );
    if (exempt) {
      return true;
    }

    // Identity exemption: a valid admin session bypasses the gate everywhere.
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (await this.isAdminRequest(request)) {
      return true;
    }

    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Retry-After', String(RETRY_AFTER_SECONDS));
    throw new ServiceUnavailableException('Service under maintenance');
  }

  /**
   * Best-effort check that the request comes from an authenticated admin. Any
   * failure — no cookie, bad signature, stale token version, gone user, or a
   * non-admin role — simply means "no bypass" and is swallowed; this grants a
   * preview exemption, it never authorizes anything.
   */
  private async isAdminRequest(
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
        user.role === 'admin'
      );
    } catch {
      return false;
    }
  }
}
