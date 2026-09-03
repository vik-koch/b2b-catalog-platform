import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { adminCatalogContract, AuthUser } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
import { refusals } from '../orpc/refusals';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminProductsService } from './admin-products.service';

/**
 * The admin catalog write surface. Every route is admin-only; the service
 * raises the 404/409 refusals the contract declares, which `refusals` restates
 * in the contract's terms. The output schemas keep the private sync keys and
 * internal columns from leaking — a response must match the admin schema
 * exactly.
 */
@Auth('admin')
@Controller()
export class AdminCatalogController {
  constructor(
    private readonly products: AdminProductsService,
    private readonly categories: AdminCategoriesService,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(adminCatalogContract.listProducts)
  listProducts() {
    return implement(adminCatalogContract.listProducts)
      .use(refusals)
      .handler(({ input: { query } }) => this.products.listProducts(query));
  }

  @Implement(adminCatalogContract.getProduct)
  getProduct() {
    return implement(adminCatalogContract.getProduct)
      .use(refusals)
      .handler(async ({ input: { params }, errors }) => {
        const product = await this.products.getProduct(params.slug);
        if (!product) {
          throw errors['product-not-found']({ message: 'Product not found' });
        }
        return product;
      });
  }

  @Implement(adminCatalogContract.createProduct)
  createProduct(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.createProduct)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const product = await this.products.createProduct(body, user.id);
        this.audit.record('product.created', user, product);
        return product;
      });
  }

  @Implement(adminCatalogContract.updateProduct)
  updateProduct(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.updateProduct)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const product = await this.products.updateProduct(
          params.slug,
          body,
          user.id,
        );
        this.audit.record('product.updated', user, product);
        return product;
      });
  }

  @Implement(adminCatalogContract.deleteProduct)
  deleteProduct(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.deleteProduct)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const product = await this.products.deleteProduct(params.slug, user.id);
        this.audit.record('product.deleted', user, product);
        return product;
      });
  }

  @Implement(adminCatalogContract.restoreProduct)
  restoreProduct(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.restoreProduct)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const product = await this.products.restoreProduct(
          params.slug,
          user.id,
        );
        this.audit.record('product.restored', user, product);
        return product;
      });
  }

  @Implement(adminCatalogContract.setProductPublished)
  setProductPublished(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.setProductPublished)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const product = await this.products.setProductPublished(
          params.slug,
          body.published,
          user.id,
        );
        this.audit.record(
          body.published ? 'product.published' : 'product.unpublished',
          user,
          product,
        );
        return product;
      });
  }

  @Implement(adminCatalogContract.listHiddenProducts)
  listHiddenProducts() {
    return implement(adminCatalogContract.listHiddenProducts)
      .use(refusals)
      .handler(async ({ input: { params } }) => ({
        items: await this.products.listHiddenProducts(params.slug),
      }));
  }

  @Implement(adminCatalogContract.listCategories)
  listCategories() {
    return implement(adminCatalogContract.listCategories)
      .use(refusals)
      .handler(async () => ({
        categories: await this.categories.listCategories(),
      }));
  }

  @Implement(adminCatalogContract.createCategory)
  createCategory(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.createCategory)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const category = await this.categories.createCategory(body, user.id);
        this.audit.record('category.created', user, category);
        return category;
      });
  }

  @Implement(adminCatalogContract.updateCategory)
  updateCategory(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.updateCategory)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const category = await this.categories.updateCategory(
          params.id,
          body,
          user.id,
        );
        this.audit.record('category.updated', user, category);
        return category;
      });
  }

  @Implement(adminCatalogContract.deleteCategory)
  deleteCategory(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.deleteCategory)
      .use(refusals)
      .handler(async ({ input: { params, query } }) => {
        const result = await this.categories.deleteCategory(
          params.id,
          query.reassignTo,
        );
        this.audit.record('category.deleted', user, { id: params.id });
        return result;
      });
  }

  @Implement(adminCatalogContract.reorderCategories)
  reorderCategories(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.reorderCategories)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const categories = await this.categories.reorderCategories(body);
        this.audit.record('category.reordered', user, {});
        return { categories };
      });
  }
}
