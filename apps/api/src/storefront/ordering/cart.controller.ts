import { Controller, Inject, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { cartContract } from '@b2b-catalog-platform/shared/storefront/ordering';
import { TaxConfig } from '@b2b-catalog-platform/shared/platform';
import { OptionalAuthGuard } from '../../platform/auth/optional-auth.guard';
import { PricingTier } from '../../platform/auth/pricing-tier.decorator';
import { TAX_CONFIG } from '../../config/deployment-config';
import { DRIZZLE } from '../../db/database.module';
import { SearchThrottle } from '../../throttling/throttle-presets';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import { priceCart } from '../../core/ordering/cart-pricing';

/**
 * Pricing the browser's cart (FR-CART-01/02). `OptionalAuthGuard` rather than
 * `@TierPriced()`: a POST is not cached, so nothing varies by session. A guest
 * is priced from the default list. Throttled like search: an unauthenticated
 * N-product lookup.
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
        // Advisories, never a refusal: a stale cart is a state to show.
        return preview;
      },
    );
  }
}
