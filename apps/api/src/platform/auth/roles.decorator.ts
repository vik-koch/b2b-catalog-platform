import { Reflector } from '@nestjs/core';

import { UserRole } from '@b2b-catalog-platform/shared/platform';

/** The roles a route allows; empty allows any signed-in account. Set through
 * `@Auth(...)`, which also reads it for the maintenance gate. */
export const Roles = Reflector.createDecorator<UserRole[]>();
