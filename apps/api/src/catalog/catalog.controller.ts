import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import {
  catalogContract,
  parseAttributeParams,
} from '@b2b-catalog-platform/shared';
import { CatalogService } from './catalog.service';
import { PricingTier } from '../auth/pricing-tier.decorator';
import { TierPriced } from '../auth/tier-priced.decorator';
import {
  SearchThrottle,
  SuggestionThrottle,
} from '../throttling/throttle-presets';

/**
 * The storefront read API (FR-CAT-01…05), backed by the database. The
 * contract's output schemas are enforced on the way out, so no internal column
 * (e.g. a product's private `sourceId`) can leak.
 *
 * Public, but not session-blind: `@TierPriced()` reads a session if one is
 * offered so a signed-in customer gets their tier's prices (FR-AUTH-05), and
 * marks those responses so no cache serves them to anyone else. It never
 * rejects, and a request without the cookie does no extra work.
 */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Implement(catalogContract.getCategoryTree)
  getCategoryTree() {
    return implement(catalogContract.getCategoryTree).handler(async () => ({
      categories: await this.catalog.getCategoryTree(),
    }));
  }

  @TierPriced()
  @Implement(catalogContract.getCategoryProducts)
  getCategoryProducts(@PricingTier() tierId: string | null) {
    return implement(catalogContract.getCategoryProducts).handler(
      async ({ input: { params, query }, errors }) => {
        const result = await this.catalog.getCategoryProducts(
          params.slug,
          query.page,
          query.sort,
          tierId,
          parseAttributeParams(query.attr),
        );
        if (!result)
          throw errors['not-found']({ message: 'Category not found' });
        return result;
      },
    );
  }

  @SearchThrottle()
  @TierPriced()
  @Implement(catalogContract.searchProducts)
  searchProducts(@PricingTier() tierId: string | null) {
    return implement(catalogContract.searchProducts).handler(
      ({ input: { query } }) =>
        this.catalog.searchProducts(
          query.q,
          query.page,
          query.sort,
          tierId,
          parseAttributeParams(query.attr),
        ),
    );
  }

  @SuggestionThrottle()
  @Implement(catalogContract.getSearchSuggestions)
  getSearchSuggestions() {
    return implement(catalogContract.getSearchSuggestions).handler(
      async ({ input: { query } }) => ({
        items: await this.catalog.getSearchSuggestions(query.q),
      }),
    );
  }

  @Implement(catalogContract.getSitemap)
  getSitemap() {
    return implement(catalogContract.getSitemap).handler(() =>
      this.catalog.getSitemap(),
    );
  }

  @TierPriced()
  @Implement(catalogContract.getProductPairings)
  getProductPairings(@PricingTier() tierId: string | null) {
    return implement(catalogContract.getProductPairings).handler(
      async ({ input: { params }, errors }) => {
        const items = await this.catalog.getProductPairings(
          params.slug,
          tierId,
        );
        if (!items) throw errors['not-found']({ message: 'Product not found' });
        return { items };
      },
    );
  }

  @TierPriced()
  @Implement(catalogContract.getProduct)
  getProduct(@PricingTier() tierId: string | null) {
    return implement(catalogContract.getProduct).handler(
      async ({ input: { params }, errors }) => {
        const product = await this.catalog.getProduct(params.slug, tierId);
        if (!product)
          throw errors['not-found']({ message: 'Product not found' });
        return product;
      },
    );
  }
}
