import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { OptionalAuthGuard } from './optional-auth.guard';
import { SessionVaryingInterceptor } from './session-varying.interceptor';

/**
 * A public route whose prices depend on the caller (FR-AUTH-05). Guard and
 * cache headers in one decorator: a route that reads a tier without saying so
 * lets a cache serve one customer's prices to another.
 */
export const TierPriced = () =>
  applyDecorators(
    UseGuards(OptionalAuthGuard),
    UseInterceptors(SessionVaryingInterceptor),
  );
