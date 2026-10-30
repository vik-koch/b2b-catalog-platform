import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { adminProductsContract } from '@b2b-catalog-platform/shared/admin/catalog';
import { Auth } from '../../../auth/auth.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';
import { AuditLogger } from '../../../audit/audit.logger';
import { refusals } from '../../../orpc/refusals';
import { CatalogReader } from '../../../core/catalog/catalog-reader';
import { ProductEditorService } from './product-editor.service';
import { ProductGridService } from './grid/product-grid.service';
import { ProductLifecycleService } from './product-lifecycle.service';
import { ProductRecords } from './product-records';
import { productPageOf } from './product-page';

/**
 * The admin's product routes. Every route is admin-only; the service
 * raises the 404/409 refusals the contract declares, which `refusals` restates
 * in the contract's terms. The output schemas keep the private sync keys and
 * internal columns from leaking — a response must match the admin schema
 * exactly.
 */
@Auth('admin')
@Controller()
export class ProductsController {
  constructor(
    private readonly grid: ProductGridService,
    private readonly records: ProductRecords,
    private readonly editor: ProductEditorService,
    private readonly lifecycle: ProductLifecycleService,
    private readonly reader: CatalogReader,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(adminProductsContract.listProducts)
  listProducts() {
    return implement(adminProductsContract.listProducts)
      .use(refusals)
      .handler(({ input: { query } }) => this.grid.listProducts(query));
  }

  @Implement(adminProductsContract.getProduct)
  getProduct() {
    return implement(adminProductsContract.getProduct)
      .use(refusals)
      .handler(async ({ input: { params }, errors }) => {
        const product = await this.records.get(params.slug);
        if (!product) {
          throw errors['product-not-found']({ message: 'Product not found' });
        }
        return product;
      });
  }

  @Implement(adminProductsContract.getProductPage)
  getProductPage() {
    return implement(adminProductsContract.getProductPage)
      .use(refusals)
      .handler(async ({ input: { params }, errors }) => {
        const read = await this.reader.readProduct(
          params.slug,
          null,
          undefined,
        );
        if (!read) {
          throw errors['product-not-found']({ message: 'Product not found' });
        }
        return productPageOf(read);
      });
  }

  @Implement(adminProductsContract.createProduct)
  createProduct(@CurrentUser() user: AuthUser) {
    return implement(adminProductsContract.createProduct)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const product = await this.editor.createProduct(body, user.id);
        this.audit.record('product.created', user, product);
        return product;
      });
  }

  @Implement(adminProductsContract.updateProduct)
  updateProduct(@CurrentUser() user: AuthUser) {
    return implement(adminProductsContract.updateProduct)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const product = await this.editor.updateProduct(
          params.slug,
          body,
          user.id,
        );
        this.audit.record('product.updated', user, product);
        return product;
      });
  }

  @Implement(adminProductsContract.deleteProduct)
  deleteProduct(@CurrentUser() user: AuthUser) {
    return implement(adminProductsContract.deleteProduct)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const product = await this.lifecycle.deleteProduct(
          params.slug,
          user.id,
        );
        this.audit.record('product.deleted', user, product);
        return product;
      });
  }

  @Implement(adminProductsContract.restoreProduct)
  restoreProduct(@CurrentUser() user: AuthUser) {
    return implement(adminProductsContract.restoreProduct)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const product = await this.lifecycle.restoreProduct(
          params.slug,
          user.id,
        );
        this.audit.record('product.restored', user, product);
        return product;
      });
  }

  @Implement(adminProductsContract.purgeProduct)
  purgeProduct(@CurrentUser() user: AuthUser) {
    return implement(adminProductsContract.purgeProduct)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const product = await this.lifecycle.purgeProduct(params.slug);
        this.audit.record('product.purged', user, product);
        return product;
      });
  }

  @Implement(adminProductsContract.listStrandedPairings)
  listStrandedPairings() {
    return implement(adminProductsContract.listStrandedPairings)
      .use(refusals)
      .handler(async ({ input: { params } }) => ({
        items: await this.lifecycle.listStrandedPairings(params.slug),
      }));
  }

  @Implement(adminProductsContract.setProductPublished)
  setProductPublished(@CurrentUser() user: AuthUser) {
    return implement(adminProductsContract.setProductPublished)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const product = await this.lifecycle.setProductPublished(
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

  @Implement(adminProductsContract.listHiddenProducts)
  listHiddenProducts() {
    return implement(adminProductsContract.listHiddenProducts)
      .use(refusals)
      .handler(async ({ input: { params } }) => ({
        items: await this.grid.listHiddenProducts(params.slug),
      }));
  }
}
