import { applyDecorators, UseGuards } from '@nestjs/common';
import { UserRole } from '@b2b-catalog-platform/shared';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/**
 * Guards a route in one decorator, mirroring the throttle-preset pattern.
 * `@Auth()` requires any authenticated user; `@Auth('admin', 'manager')`
 * additionally restricts to those roles. Guard order matters: JwtAuthGuard runs
 * first to populate the user, then RolesGuard checks it.
 */
export const Auth = (...roles: UserRole[]) =>
  applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(roles));
