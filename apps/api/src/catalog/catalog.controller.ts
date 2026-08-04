import { Controller, UseGuards } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { catalogContract } from '@b2b-catalog-platform/shared';
import { CatalogService } from './catalog.service';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { PricingTier } from '../auth/pricing-tier.decorator';
import {
  SearchThrottle,
  SuggestionThrottle,
} from '../throttling/throttle-presets';

/**
 * The storefront read API (FR-CAT-01…05), backed by the database. Response
 * validation (`validateResponses`) enforces the contract on the way out, so no
 * internal column (e.g. a product's private `sourceId`) can leak.
 *
 * Public, but not session-blind: OptionalAuthGuard reads a session if one is
 * offered so a signed-in customer gets their tier's prices (FR-AUTH-05). It
 * never rejects, and a request without the cookie does no extra work.
 */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @TsRestHandler(catalogContract.getCategoryTree, { validateResponses: true })
  async getCategoryTree() {
    return tsRestHandler(catalogContract.getCategoryTree, async () => ({
      status: 200,
      body: { categories: await this.catalog.getCategoryTree() },
    }));
  }

  @UseGuards(OptionalAuthGuard)
  @TsRestHandler(catalogContract.getCategoryProducts, {
    validateResponses: true,
  })
  async getCategoryProducts(@PricingTier() tierId: string | null) {
    return tsRestHandler(
      catalogContract.getCategoryProducts,
      async ({ params: { slug }, query: { page, sort } }) => {
        const result = await this.catalog.getCategoryProducts(
          slug,
          page,
          sort,
          tierId,
        );
        if (!result) {
          return { status: 404, body: { message: 'Category not found' } };
        }
        return { status: 200, body: result };
      },
    );
  }

  @SearchThrottle()
  @UseGuards(OptionalAuthGuard)
  @TsRestHandler(catalogContract.searchProducts, { validateResponses: true })
  async searchProducts(@PricingTier() tierId: string | null) {
    return tsRestHandler(
      catalogContract.searchProducts,
      async ({ query: { q, page, sort } }) => ({
        status: 200,
        body: await this.catalog.searchProducts(q, page, sort, tierId),
      }),
    );
  }

  @SuggestionThrottle()
  @TsRestHandler(catalogContract.getSearchSuggestions, {
    validateResponses: true,
  })
  async getSearchSuggestions() {
    return tsRestHandler(
      catalogContract.getSearchSuggestions,
      async ({ query: { q } }) => ({
        status: 200,
        body: { items: await this.catalog.getSearchSuggestions(q) },
      }),
    );
  }

  @TsRestHandler(catalogContract.getSitemap, { validateResponses: true })
  async getSitemap() {
    return tsRestHandler(catalogContract.getSitemap, async () => ({
      status: 200,
      body: await this.catalog.getSitemap(),
    }));
  }

  @UseGuards(OptionalAuthGuard)
  @TsRestHandler(catalogContract.getProduct, { validateResponses: true })
  async getProduct(@PricingTier() tierId: string | null) {
    return tsRestHandler(
      catalogContract.getProduct,
      async ({ params: { slug } }) => {
        const product = await this.catalog.getProduct(slug, tierId);
        if (!product) {
          return { status: 404, body: { message: 'Product not found' } };
        }
        return { status: 200, body: product };
      },
    );
  }
}
