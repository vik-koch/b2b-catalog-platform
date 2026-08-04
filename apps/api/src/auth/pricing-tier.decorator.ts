import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from './authenticated-request';

/**
 * Injects the caller's pricing tier id, or null for the default list.
 *
 * Unlike `@CurrentUser`, a missing value is not a wiring bug worth shouting
 * about — but it would silently show every customer default prices, so a route
 * using this must carry `@UseGuards(OptionalAuthGuard)`. Null is returned for a
 * guest either way; the guard is what distinguishes "no session" from "never
 * looked".
 */
export const PricingTier = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.pricingTierId ?? null;
  },
);
