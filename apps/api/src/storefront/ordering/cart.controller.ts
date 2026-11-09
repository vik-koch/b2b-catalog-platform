import { Controller, Inject, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';

import { TaxConfig } from '@b2b-catalog-platform/shared/core/catalog';
import { cartContract } from '@b2b-catalog-platform/shared/storefront/ordering';

import { TAX_CONFIG } from '../../core/catalog/catalog-config';
import { PricingTier } from '../../core/catalog/pricing-tier.decorator';
import { priceCart } from '../../core/ordering/cart-pricing';
import { OptionalAuthGuard } from '../../platform/auth/optional-auth.guard';
import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';
import { SearchThrottle } from '../../platform/throttling/throttle-presets';

/**
 * Pricing the browser's cart (FR-CART-01/02). `OptionalAuthGuard` rather than
 * `@TierPriced()`: a POST is not cached, so nothing varies by session. A guest
 * is priced from the default list. Throttled like search: an unauthenticated
 * N-product lookup.
 */
@Controller()
export class CartController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
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
        // Advisories, never a refusal: a stale cart is a state to show.
        return preview;
      },
    );
  }
}
