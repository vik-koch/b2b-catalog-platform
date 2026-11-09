import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedRequest } from '../../platform/auth/authenticated-request';

/** The caller's tier id, or null for the default list. Needs `@TierPriced()`:
 * without its guard every customer silently gets the default prices. */
export const PricingTier = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.pricingTierId ?? null;
  },
);
