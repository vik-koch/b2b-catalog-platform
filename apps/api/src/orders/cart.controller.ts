import { Controller, Inject, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { cartContract, TaxConfig } from '@b2b-catalog-platform/shared';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { PricingTier } from '../auth/pricing-tier.decorator';
import { TAX_CONFIG } from '../config/deployment-config';
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
    @Inject(TAX_CONFIG) private readonly tax: TaxConfig,
  ) {}

  @SearchThrottle()
  @UseGuards(OptionalAuthGuard)
  @Implement(cartContract.previewCart)
  previewCart(@PricingTier() tierId: string | null) {
    return implement(cartContract.previewCart).handler(
      async ({ input: { body } }) => {
        const { preview } = await priceCart(
          this.db,
          body.lines,
          tierId,
          this.tax,
        );
        // A priced cart with advisories, never a refusal: a stale cart is a
        // normal state to be shown, and nothing here changes what the browser
        // holds.
        return preview;
      },
    );
  }
}
