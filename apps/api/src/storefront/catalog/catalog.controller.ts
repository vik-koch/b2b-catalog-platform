import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { catalogContract } from '@b2b-catalog-platform/shared/storefront/catalog';
import { parseAttributeParams } from '@b2b-catalog-platform/shared/core/catalog';
import { CatalogService } from './catalog.service';
import { PricingTier } from '../../auth/pricing-tier.decorator';
import { TierPriced } from '../../auth/tier-priced.decorator';

/**
 * The storefront's catalog reads (FR-CAT-01…05); search has its own
 * controller. The output schemas are enforced on the way out, so no internal
 * column can leak.
 *
 * Public, but not session-blind: `@TierPriced()` reads a session if one is
 * offered, so a signed-in customer gets their tier's prices (FR-AUTH-05), and
 * keeps those responses out of shared caches. It never rejects.
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
  @Implement(catalogContract.getCatalogProducts)
  getCatalogProducts(@PricingTier() tierId: string | null) {
    return implement(catalogContract.getCatalogProducts).handler(
      ({ input: { query } }) =>
        this.catalog.getCatalogProducts(
          query.page,
          query.sort,
          tierId,
          parseAttributeParams(query.attr),
        ),
    );
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
  @Implement(catalogContract.getFeaturedProducts)
  getFeaturedProducts(@PricingTier() tierId: string | null) {
    return implement(catalogContract.getFeaturedProducts).handler(async () => ({
      items: await this.catalog.getFeaturedProducts(tierId),
    }));
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
