import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import {
  catalogContract,
  CATALOG_PAGE_SIZE,
} from '@b2b-catalog-platform/shared';
import {
  buildCategoryTree,
  categoryAncestors,
  categoryAndDescendantSlugs,
  categoryChildren,
  findCategory,
  findProduct,
  seedImages,
  SEED_PRODUCTS,
} from './catalog-seed';

/**
 * The storefront read API (FR-CAT-01…05). Currently backed by an in-memory
 * seed (`catalog-seed.ts`) while the UI is built; the DB-backed read model that
 * the file sync populates replaces the seed later without changing this shape.
 *
 * `validateResponses` makes zod enforce the contract on the way out, so no
 * internal field could ever leak — the same guard the pages endpoint relies on.
 */
@Controller()
export class CatalogController {
  @TsRestHandler(catalogContract.getCategoryTree, { validateResponses: true })
  async getCategoryTree() {
    return tsRestHandler(catalogContract.getCategoryTree, async () => ({
      status: 200,
      body: { categories: buildCategoryTree() },
    }));
  }

  @TsRestHandler(catalogContract.getCategoryProducts, {
    validateResponses: true,
  })
  async getCategoryProducts() {
    return tsRestHandler(
      catalogContract.getCategoryProducts,
      async ({ params: { slug }, query: { page } }) => {
        const category = findCategory(slug);
        if (!category) {
          return { status: 404, body: { message: 'Category not found' } };
        }

        const inScope = categoryAndDescendantSlugs(slug);
        const all = SEED_PRODUCTS.filter((p) => inScope.has(p.categorySlug));

        const pageSize = CATALOG_PAGE_SIZE;
        const total = all.length;
        const totalPages = Math.ceil(total / pageSize);
        const start = (page - 1) * pageSize;
        const items = all.slice(start, start + pageSize).map((p) => ({
          slug: p.slug,
          name: p.name,
          priceMinor: p.priceMinor,
          images: seedImages(p.slug, p.imageCount),
        }));

        return {
          status: 200,
          body: {
            category: {
              slug: category.slug,
              name: category.name,
              ancestors: categoryAncestors(slug),
              subcategories: categoryChildren(slug),
            },
            items,
            pagination: { page, pageSize, total, totalPages },
          },
        };
      },
    );
  }

  @TsRestHandler(catalogContract.getProduct, { validateResponses: true })
  async getProduct() {
    return tsRestHandler(
      catalogContract.getProduct,
      async ({ params: { slug } }) => {
        const product = findProduct(slug);
        if (!product) {
          return { status: 404, body: { message: 'Product not found' } };
        }
        const category = findCategory(product.categorySlug);
        return {
          status: 200,
          body: {
            slug: product.slug,
            name: product.name,
            priceMinor: product.priceMinor,
            descriptionHtml: product.descriptionHtml,
            images: seedImages(product.slug, product.imageCount),
            attributes: product.attributes,
            category: {
              slug: category?.slug ?? product.categorySlug,
              name: category?.name ?? product.categorySlug,
            },
          },
        };
      },
    );
  }
}
