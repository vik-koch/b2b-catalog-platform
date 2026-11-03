import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthenticatedRequest } from './authenticated-request';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

/** The signed-in account on an `@Auth()` route. Absent means the route lost
 * its guard: a wiring bug, so a 500 rather than a 401. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      throw new InternalServerErrorException(
        'CurrentUser used on a route without the Auth guard',
      );
    }
    return user;
  },
);

/** The account, or null for a guest, on a route that reads a session without
 * requiring one. Needs `OptionalAuthGuard`, or every caller is a guest. */
export const CurrentUserOptional = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | null => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return user ?? null;
  },
);
