import { Controller, Inject, UseGuards } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { cartContract } from '@b2b-catalog-platform/shared';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { PricingTier } from '../auth/pricing-tier.decorator';
import { DRIZZLE } from '../db/database.module';
import { SearchThrottle } from '../throttling/throttle-presets';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { priceCart } from './cart-pricing';

/**
 * Pricing the browser's cart (FR-CART-01/02).
 *
 * `OptionalAuthGuard` directly rather than the `@TierPriced()` composite: that
 * one also marks the response as session-varying for shared caches, which says
 * nothing about a POST. A guest is still priced — from the default list, and
 * without ever being told tiers exist.
 *
 * Throttled like search: this is called when the cart page loads and when
 * signing in re-prices what is held, not per keystroke — and it is an
 * unauthenticated N-product lookup, which the contract's `CART_LINES_MAX`
 * bounds as well.
 */
@Controller()
export class CartController {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  @SearchThrottle()
  @UseGuards(OptionalAuthGuard)
  @TsRestHandler(cartContract.previewCart, { validateResponses: true })
  previewCart(@PricingTier() tierId: string | null) {
    return tsRestHandler(cartContract.previewCart, async ({ body }) => {
      const { preview } = await priceCart(this.db, body.lines, tierId);
      // 200 with advisories, never a refusal: a stale cart is a normal state
      // to be shown, and nothing here changes what the browser holds.
      return { status: 200 as const, body: preview };
    });
  }
}
