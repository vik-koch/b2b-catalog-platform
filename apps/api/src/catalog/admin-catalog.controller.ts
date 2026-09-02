import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { adminCatalogContract, AuthUser } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
import { refusals } from '../orpc/refusals';
import { AdminCatalogService } from './admin-catalog.service';

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
    private readonly service: AdminCatalogService,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(adminCatalogContract.listProducts)
  listProducts() {
    return implement(adminCatalogContract.listProducts)
      .use(refusals)
      .handler(({ input: { query } }) => this.service.listProducts(query));
  }

  @Implement(adminCatalogContract.getProduct)
  getProduct() {
    return implement(adminCatalogContract.getProduct)
      .use(refusals)
      .handler(async ({ input: { params }, errors }) => {
        const product = await this.service.getProduct(params.slug);
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
        const product = await this.service.createProduct(body, user.id);
        this.audit.record('product.created', user, product);
        return product;
      });
  }

  @Implement(adminCatalogContract.updateProduct)
  updateProduct(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.updateProduct)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const product = await this.service.updateProduct(
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
        const product = await this.service.deleteProduct(params.slug, user.id);
        this.audit.record('product.deleted', user, product);
        return product;
      });
  }

  @Implement(adminCatalogContract.restoreProduct)
  restoreProduct(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.restoreProduct)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const product = await this.service.restoreProduct(params.slug, user.id);
        this.audit.record('product.restored', user, product);
        return product;
      });
  }

  @Implement(adminCatalogContract.setProductPublished)
  setProductPublished(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.setProductPublished)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const product = await this.service.setProductPublished(
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
        items: await this.service.listHiddenProducts(params.slug),
      }));
  }

  @Implement(adminCatalogContract.listCategories)
  listCategories() {
    return implement(adminCatalogContract.listCategories)
      .use(refusals)
      .handler(async () => ({
        categories: await this.service.listCategories(),
      }));
  }

  @Implement(adminCatalogContract.createCategory)
  createCategory(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.createCategory)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const category = await this.service.createCategory(body, user.id);
        this.audit.record('category.created', user, category);
        return category;
      });
  }

  @Implement(adminCatalogContract.updateCategory)
  updateCategory(@CurrentUser() user: AuthUser) {
    return implement(adminCatalogContract.updateCategory)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const category = await this.service.updateCategory(
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
        const result = await this.service.deleteCategory(
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
        const categories = await this.service.reorderCategories(body);
        this.audit.record('category.reordered', user, {});
        return { categories };
      });
  }
}
