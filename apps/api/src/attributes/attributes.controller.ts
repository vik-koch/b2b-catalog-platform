import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { attributesContract, AuthUser } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
import { refusals } from '../orpc/refusals';
import { AttributesService } from './attributes.service';

/**
 * Admin-only throughout, like the rest of the catalog write surface: which
 * attributes a shop filters by is a decision about the catalog's presentation,
 * and a manager never edits the catalog.
 */
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

  /**
   * The inventory (FR-ATTR-09) — every key in use, declared or freetext. It
   * reads product data, but it is keyed by attribute rather than by product,
   * which is why it lives here and not on the catalog surface.
   */
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

  /**
   * Both renames rewrite product data across the catalog in one statement, so
   * both are audited with the text on either side — the trail is what makes a
   * merge answerable afterwards.
   */
  @Implement(attributesContract.renameAttributeKey)
  renameAttributeKey(@CurrentUser() user: AuthUser) {
    return implement(attributesContract.renameAttributeKey)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const result = await this.service.renameAttributeKey(body);
        // The trail's `name` carries both spellings and the row count: a
        // rename is a merge as often as a correction, and afterwards the
        // question is always which text absorbed which.
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

  /**
   * A category's own filter panel (FR-ATTR-11). Read is unaudited like every
   * other read; the two writes carry the category, because a panel that lost
   * an attribute is otherwise indistinguishable from one that never offered
   * it.
   */
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
