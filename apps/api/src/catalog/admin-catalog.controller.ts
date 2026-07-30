import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { adminCatalogContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { AdminCatalogService } from './admin-catalog.service';

/**
 * The admin catalog write surface. Every route is admin-only; the service
 * throws NotFound/Conflict for the 404/409 paths the contract declares.
 * `validateResponses` keeps the private sync keys and internal columns from
 * leaking — the response must match the admin schema exactly.
 */
@Auth('admin')
@Controller()
export class AdminCatalogController {
  constructor(private readonly service: AdminCatalogService) {}

  @TsRestHandler(adminCatalogContract.listProducts, { validateResponses: true })
  listProducts() {
    return tsRestHandler(
      adminCatalogContract.listProducts,
      async ({ query }) => {
        // page carries a zod default; the pre-parse handler type still sees it as
        // optional, so re-apply the default here for the service's required param.
        const body = await this.service.listProducts({
          page: query.page ?? 1,
          categoryId: query.categoryId,
        });
        return { status: 200, body };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.getProduct, { validateResponses: true })
  getProduct() {
    return tsRestHandler(
      adminCatalogContract.getProduct,
      async ({ params: { slug } }) => {
        const product = await this.service.getProduct(slug);
        return product
          ? { status: 200 as const, body: product }
          : { status: 404 as const, body: { message: 'Product not found' } };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.createProduct, {
    validateResponses: true,
  })
  createProduct() {
    return tsRestHandler(
      adminCatalogContract.createProduct,
      async ({ body }) => {
        const product = await this.service.createProduct(body);
        return { status: 201, body: product };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.updateProduct, {
    validateResponses: true,
  })
  updateProduct() {
    return tsRestHandler(
      adminCatalogContract.updateProduct,
      async ({ params: { slug }, body }) => {
        const product = await this.service.updateProduct(slug, body);
        return { status: 200, body: product };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.deleteProduct, {
    validateResponses: true,
  })
  deleteProduct() {
    return tsRestHandler(
      adminCatalogContract.deleteProduct,
      async ({ params: { slug } }) => {
        const product = await this.service.deleteProduct(slug);
        return { status: 200, body: product };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.restoreProduct, {
    validateResponses: true,
  })
  restoreProduct() {
    return tsRestHandler(
      adminCatalogContract.restoreProduct,
      async ({ params: { slug } }) => {
        const product = await this.service.restoreProduct(slug);
        return { status: 200, body: product };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.listDeletedProducts, {
    validateResponses: true,
  })
  listDeletedProducts() {
    return tsRestHandler(
      adminCatalogContract.listDeletedProducts,
      async ({ params: { slug } }) => {
        const items = await this.service.listDeletedProducts(slug);
        return { status: 200, body: { items } };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.listCategories, {
    validateResponses: true,
  })
  listCategories() {
    return tsRestHandler(adminCatalogContract.listCategories, async () => {
      const categories = await this.service.listCategories();
      return { status: 200, body: { categories } };
    });
  }

  @TsRestHandler(adminCatalogContract.createCategory, {
    validateResponses: true,
  })
  createCategory() {
    return tsRestHandler(
      adminCatalogContract.createCategory,
      async ({ body }) => {
        const category = await this.service.createCategory(body);
        return { status: 201, body: category };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.updateCategory, {
    validateResponses: true,
  })
  updateCategory() {
    return tsRestHandler(
      adminCatalogContract.updateCategory,
      async ({ params: { id }, body }) => {
        const category = await this.service.updateCategory(id, body);
        return { status: 200, body: category };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.deleteCategory, {
    validateResponses: true,
  })
  deleteCategory() {
    return tsRestHandler(
      adminCatalogContract.deleteCategory,
      async ({ params: { id }, query }) => {
        const body = await this.service.deleteCategory(id, query.reassignTo);
        return { status: 200, body };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.reorderCategories, {
    validateResponses: true,
  })
  reorderCategories() {
    return tsRestHandler(
      adminCatalogContract.reorderCategories,
      async ({ body }) => {
        const categories = await this.service.reorderCategories(body);
        return { status: 200, body: { categories } };
      },
    );
  }
}
