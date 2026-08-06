import { applyDecorators, UseGuards, UseInterceptors } from '@nestjs/common';
import { OptionalAuthGuard } from './optional-auth.guard';
import { SessionVaryingInterceptor } from './session-varying.interceptor';

/**
 * Marks a public route whose prices depend on the caller (FR-AUTH-05): reads a
 * session if one is offered, and tells caches that the answer is not the same
 * for everyone. Mirrors the `@Auth()` pattern.
 *
 * The two halves belong together — a route that resolves a tier without saying
 * so lets a cache serve one customer's prices to another — so they are one
 * decorator rather than two lines to remember. Reach for `@PricingTier()` in
 * the handler to read the resolved tier.
 */
export const TierPriced = () =>
  applyDecorators(
    UseGuards(OptionalAuthGuard),
    UseInterceptors(SessionVaryingInterceptor),
  );
