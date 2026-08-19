import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { adminCatalogContract, AuthUser } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
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
  constructor(
    private readonly service: AdminCatalogService,
    private readonly audit: AuditLogger,
  ) {}

  @TsRestHandler(adminCatalogContract.listProducts, { validateResponses: true })
  listProducts() {
    return tsRestHandler(
      adminCatalogContract.listProducts,
      async ({ query }) => {
        // page/state/q/sort carry zod defaults; the pre-parse handler type still
        // sees them as optional, so re-apply them here for the service's
        // required params.
        const body = await this.service.listProducts({
          page: query.page ?? 1,
          categoryId: query.categoryId,
          state: query.state ?? 'all',
          q: query.q ?? '',
          sort: query.sort ?? 'relevance',
          attributeKey: query.attributeKey,
          attributeValue: query.attributeValue,
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
          : {
              status: 404 as const,
              body: {
                code: 'product-not-found' as const,
                message: 'Product not found',
              },
            };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.createProduct, {
    validateResponses: true,
  })
  createProduct(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      adminCatalogContract.createProduct,
      async ({ body }) => {
        const product = await this.service.createProduct(body, user.id);
        this.audit.record('product.created', user, product);
        return { status: 201, body: product };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.updateProduct, {
    validateResponses: true,
  })
  updateProduct(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      adminCatalogContract.updateProduct,
      async ({ params: { slug }, body }) => {
        const product = await this.service.updateProduct(slug, body, user.id);
        this.audit.record('product.updated', user, product);
        return { status: 200, body: product };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.deleteProduct, {
    validateResponses: true,
  })
  deleteProduct(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      adminCatalogContract.deleteProduct,
      async ({ params: { slug } }) => {
        const product = await this.service.deleteProduct(slug, user.id);
        this.audit.record('product.deleted', user, product);
        return { status: 200, body: product };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.restoreProduct, {
    validateResponses: true,
  })
  restoreProduct(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      adminCatalogContract.restoreProduct,
      async ({ params: { slug } }) => {
        const product = await this.service.restoreProduct(slug, user.id);
        this.audit.record('product.restored', user, product);
        return { status: 200, body: product };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.setProductPublished, {
    validateResponses: true,
  })
  setProductPublished(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      adminCatalogContract.setProductPublished,
      async ({ params: { slug }, body }) => {
        const product = await this.service.setProductPublished(
          slug,
          body.published,
          user.id,
        );
        this.audit.record(
          body.published ? 'product.published' : 'product.unpublished',
          user,
          product,
        );
        return { status: 200, body: product };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.listHiddenProducts, {
    validateResponses: true,
  })
  listHiddenProducts() {
    return tsRestHandler(
      adminCatalogContract.listHiddenProducts,
      async ({ params: { slug } }) => {
        const items = await this.service.listHiddenProducts(slug);
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
  createCategory(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      adminCatalogContract.createCategory,
      async ({ body }) => {
        const category = await this.service.createCategory(body, user.id);
        this.audit.record('category.created', user, category);
        return { status: 201, body: category };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.updateCategory, {
    validateResponses: true,
  })
  updateCategory(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      adminCatalogContract.updateCategory,
      async ({ params: { id }, body }) => {
        const category = await this.service.updateCategory(id, body, user.id);
        this.audit.record('category.updated', user, category);
        return { status: 200, body: category };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.deleteCategory, {
    validateResponses: true,
  })
  deleteCategory(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      adminCatalogContract.deleteCategory,
      async ({ params: { id }, query }) => {
        const body = await this.service.deleteCategory(id, query.reassignTo);
        this.audit.record('category.deleted', user, { id });
        return { status: 200, body };
      },
    );
  }

  @TsRestHandler(adminCatalogContract.reorderCategories, {
    validateResponses: true,
  })
  reorderCategories(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      adminCatalogContract.reorderCategories,
      async ({ body }) => {
        const categories = await this.service.reorderCategories(body);
        this.audit.record('category.reordered', user, {});
        return { status: 200, body: { categories } };
      },
    );
  }
}
