import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { OptionalAuthGuard } from './optional-auth.guard';
import { SessionVaryingInterceptor } from './session-varying.interceptor';

/**
 * A public route whose prices depend on the caller (FR-AUTH-05): reads a session
 * if one is offered, and tells caches the answer is not the same for everyone.
 * One decorator because a route that resolves a tier without saying so lets a
 * cache serve one customer's prices to another. Read the tier with
 * `@PricingTier()`.
 */
export const TierPriced = () =>
  applyDecorators(
    UseGuards(OptionalAuthGuard),
    UseInterceptors(SessionVaryingInterceptor),
  );
