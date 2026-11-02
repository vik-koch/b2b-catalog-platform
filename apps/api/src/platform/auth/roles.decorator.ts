import { Reflector } from '@nestjs/core';
import { UserRole } from '@b2b-catalog-platform/shared';

/**
 * Attaches the set of roles allowed on a route, read back by RolesGuard. An
 * empty list (or no decorator) imposes no role restriction — authentication
 * alone suffices. Prefer the `Auth()` composite decorator over applying this
 * directly.
 */
export const Roles = Reflector.createDecorator<UserRole[]>();
