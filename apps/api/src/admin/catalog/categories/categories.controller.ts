import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { adminCategoriesContract } from '@b2b-catalog-platform/shared/admin/catalog';
import { Auth } from '../../../auth/auth.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';
import { AuditLogger } from '../../../audit/audit.logger';
import { refusals } from '../../../orpc/refusals';
import { CategoriesService } from './categories.service';

/**
 * The admin's category routes. Every route is admin-only; the service
 * raises the 404/409 refusals the contract declares, which `refusals` restates
 * in the contract's terms. The output schemas keep the private sync keys and
 * internal columns from leaking — a response must match the admin schema
 * exactly.
 */
@Auth('admin')
@Controller()
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(adminCategoriesContract.listCategories)
  listCategories() {
    return implement(adminCategoriesContract.listCategories)
      .use(refusals)
      .handler(async () => ({
        categories: await this.categories.listCategories(),
      }));
  }

  @Implement(adminCategoriesContract.createCategory)
  createCategory(@CurrentUser() user: AuthUser) {
    return implement(adminCategoriesContract.createCategory)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const category = await this.categories.createCategory(body, user.id);
        this.audit.record('category.created', user, category);
        return category;
      });
  }

  @Implement(adminCategoriesContract.updateCategory)
  updateCategory(@CurrentUser() user: AuthUser) {
    return implement(adminCategoriesContract.updateCategory)
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

  @Implement(adminCategoriesContract.deleteCategory)
  deleteCategory(@CurrentUser() user: AuthUser) {
    return implement(adminCategoriesContract.deleteCategory)
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

  @Implement(adminCategoriesContract.reorderCategories)
  reorderCategories(@CurrentUser() user: AuthUser) {
    return implement(adminCategoriesContract.reorderCategories)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const categories = await this.categories.reorderCategories(body);
        this.audit.record('category.reordered', user, {});
        return { categories };
      });
  }
}
