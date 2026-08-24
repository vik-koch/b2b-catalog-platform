import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { AuthenticatedRequest } from './authenticated-request';

/**
 * Injects the authenticated user. Only valid on routes guarded by `@Auth()`,
 * which populates request.user before the handler runs — so the type is
 * non-null. If it is ever absent, the route is missing its guard: that is a
 * wiring bug, surfaced loudly as a 500 rather than silently masqueraded as an
 * anonymous (401) request.
 */
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

/**
 * The same on a route that reads a session but does not require one — a guest
 * checkout, where absent is the normal case rather than a wiring bug. Needs
 * `OptionalAuthGuard`; without it the answer is always null, which is why
 * `@PricingTier()` carries the same warning.
 */
export const CurrentUserOptional = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | null => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return user ?? null;
  },
);
