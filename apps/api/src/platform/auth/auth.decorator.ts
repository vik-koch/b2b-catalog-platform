import { applyDecorators, UseGuards } from '@nestjs/common';

import { UserRole } from '@b2b-catalog-platform/shared/platform';

import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/** `@Auth()` requires a session, `@Auth('admin')` also a role. The order
 * matters: JwtAuthGuard puts the user on the request that RolesGuard reads. */
export const Auth = (...roles: UserRole[]) =>
  applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(roles));
