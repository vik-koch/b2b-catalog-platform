import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { attributesContract } from '@b2b-catalog-platform/shared/admin/catalog';
import { Auth } from '../../../auth/auth.decorator';
import { CurrentUser } from '../../../auth/current-user.decorator';
import { AuditLogger } from '../../../audit/audit.logger';
import { refusals } from '../../../orpc/refusals';
import { AttributesService } from './attributes.service';

/** Admin-only, like the rest of the catalog: a manager never edits it. */
@Auth('admin')
@Controller()
export class AttributesController {
  constructor(
    private readonly service: AttributesService,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(attributesContract.listAttributes)
  listAttributes() {
    return implement(attributesContract.listAttributes).handler(async () => ({
      definitions: await this.service.listAttributes(),
    }));
  }

  /** The inventory (FR-ATTR-09): every key in use, declared or not. */
  @Implement(attributesContract.listAttributeKeys)
  listAttributeKeys() {
    return implement(attributesContract.listAttributeKeys).handler(
      async () => ({ keys: await this.service.listAttributeKeys() }),
    );
  }

  @Implement(attributesContract.listAttributeValues)
  listAttributeValues() {
    return implement(attributesContract.listAttributeValues).handler(
      async ({ input: { query } }) => ({
        key: query.key,
        values: await this.service.listAttributeValues(query.key),
      }),
    );
  }

  /** Both renames rewrite product data catalog-wide, so both are audited
   * with the text on either side. */
  @Implement(attributesContract.renameAttributeKey)
  renameAttributeKey(@CurrentUser() user: AuthUser) {
    return implement(attributesContract.renameAttributeKey)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const result = await this.service.renameAttributeKey(body);
        // Both spellings and the count: a rename is often a merge, and the
        // question afterwards is which text absorbed which.
        this.audit.record('attribute.keyRenamed', user, {
          name: `${body.from} → ${body.to} (${result.updated})`,
        });
        return result;
      });
  }

  @Implement(attributesContract.renameAttributeValue)
  renameAttributeValue(@CurrentUser() user: AuthUser) {
    return implement(attributesContract.renameAttributeValue)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const result = await this.service.renameAttributeValue(body);
        this.audit.record('attribute.valueRenamed', user, {
          name: `${body.key}: ${body.from} → ${body.to} (${result.updated})`,
        });
        return result;
      });
  }

  @Implement(attributesContract.createAttribute)
  createAttribute(@CurrentUser() user: AuthUser) {
    return implement(attributesContract.createAttribute)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const definition = await this.service.createAttribute(body, user.id);
        this.audit.record('attribute.created', user, {
          id: definition.id,
          name: definition.name,
        });
        return definition;
      });
  }

  @Implement(attributesContract.updateAttribute)
  updateAttribute(@CurrentUser() user: AuthUser) {
    return implement(attributesContract.updateAttribute)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const definition = await this.service.updateAttribute(
          params.id,
          body,
          user.id,
        );
        this.audit.record('attribute.updated', user, {
          id: definition.id,
          name: definition.name,
        });
        return definition;
      });
  }

  @Implement(attributesContract.reorderAttributes)
  reorderAttributes(@CurrentUser() user: AuthUser) {
    return implement(attributesContract.reorderAttributes)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const definitions = await this.service.reorderAttributes(body, user.id);
        this.audit.record('attribute.reordered', user, {});
        return { definitions };
      });
  }

  /** A category's filter panel (FR-ATTR-11). The writes are audited with the
   * category: a panel that lost an attribute looks like one that never had it. */
  @Implement(attributesContract.getCategoryFilters)
  getCategoryFilters() {
    return implement(attributesContract.getCategoryFilters)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.service.getCategoryFilters(params.slug),
      );
  }

  @Implement(attributesContract.saveCategoryFilters)
  saveCategoryFilters(@CurrentUser() user: AuthUser) {
    return implement(attributesContract.saveCategoryFilters)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const result = await this.service.saveCategoryFilters(
          params.slug,
          body,
        );
        this.audit.record('category.filtersSaved', user, { slug: params.slug });
        return result;
      });
  }

  @Implement(attributesContract.resetCategoryFilters)
  resetCategoryFilters(@CurrentUser() user: AuthUser) {
    return implement(attributesContract.resetCategoryFilters)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const result = await this.service.resetCategoryFilters(params.slug);
        this.audit.record('category.filtersReset', user, { slug: params.slug });
        return result;
      });
  }

  @Implement(attributesContract.getCatalogFilters)
  getCatalogFilters() {
    return implement(attributesContract.getCatalogFilters)
      .use(refusals)
      .handler(() => this.service.getCatalogFilters());
  }

  @Implement(attributesContract.saveCatalogFilters)
  saveCatalogFilters(@CurrentUser() user: AuthUser) {
    return implement(attributesContract.saveCatalogFilters)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const result = await this.service.saveCatalogFilters(body);
        this.audit.record('catalog.filtersSaved', user, {});
        return result;
      });
  }

  @Implement(attributesContract.deleteAttribute)
  deleteAttribute(@CurrentUser() user: AuthUser) {
    return implement(attributesContract.deleteAttribute)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const result = await this.service.deleteAttribute(params.id);
        this.audit.record('attribute.deleted', user, { id: params.id });
        return result;
      });
  }
}
