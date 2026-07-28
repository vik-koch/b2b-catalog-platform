import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { catalogContract } from '@b2b-catalog-platform/shared';
import { CatalogService } from './catalog.service';

/**
 * The storefront read API (FR-CAT-01…05), backed by the database. Response
 * validation (`validateResponses`) enforces the contract on the way out, so no
 * internal column (e.g. a product's private `sourceId`) can leak.
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

  @TsRestHandler(catalogContract.getCategoryProducts, {
    validateResponses: true,
  })
  async getCategoryProducts() {
    return tsRestHandler(
      catalogContract.getCategoryProducts,
      async ({ params: { slug }, query: { page } }) => {
        const result = await this.catalog.getCategoryProducts(slug, page);
        if (!result) {
          return { status: 404, body: { message: 'Category not found' } };
        }
        return { status: 200, body: result };
      },
    );
  }

  @TsRestHandler(catalogContract.getProduct, { validateResponses: true })
  async getProduct() {
    return tsRestHandler(
      catalogContract.getProduct,
      async ({ params: { slug } }) => {
        const product = await this.catalog.getProduct(slug);
        if (!product) {
          return { status: 404, body: { message: 'Product not found' } };
        }
        return { status: 200, body: product };
      },
    );
  }
}
