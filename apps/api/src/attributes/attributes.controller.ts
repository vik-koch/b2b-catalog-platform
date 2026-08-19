import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { attributesContract, AuthUser } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
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

  @TsRestHandler(attributesContract.listAttributes, { validateResponses: true })
  listAttributes() {
    return tsRestHandler(attributesContract.listAttributes, async () => {
      return {
        status: 200,
        body: { definitions: await this.service.listAttributes() },
      };
    });
  }

  /**
   * The inventory (FR-ATTR-09) — every key in use, declared or freetext. It
   * reads product data, but it is keyed by attribute rather than by product,
   * which is why it lives here and not on the catalog surface.
   */
  @TsRestHandler(attributesContract.listAttributeKeys, {
    validateResponses: true,
  })
  listAttributeKeys() {
    return tsRestHandler(attributesContract.listAttributeKeys, async () => {
      return {
        status: 200,
        body: { keys: await this.service.listAttributeKeys() },
      };
    });
  }

  @TsRestHandler(attributesContract.listAttributeValues, {
    validateResponses: true,
  })
  listAttributeValues() {
    return tsRestHandler(
      attributesContract.listAttributeValues,
      async ({ query: { key } }) => {
        return {
          status: 200,
          body: { key, values: await this.service.listAttributeValues(key) },
        };
      },
    );
  }

  /**
   * Both renames rewrite product data across the catalog in one statement, so
   * both are audited with the text on either side — the trail is what makes a
   * merge answerable afterwards.
   */
  @TsRestHandler(attributesContract.renameAttributeKey, {
    validateResponses: true,
  })
  renameAttributeKey(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      attributesContract.renameAttributeKey,
      async ({ body }) => {
        const result = await this.service.renameAttributeKey(body);
        // The trail's `name` carries both spellings and the row count: a
        // rename is a merge as often as a correction, and afterwards the
        // question is always which text absorbed which.
        this.audit.record('attribute.keyRenamed', user, {
          name: `${body.from} → ${body.to} (${result.updated})`,
        });
        return { status: 200, body: result };
      },
    );
  }

  @TsRestHandler(attributesContract.renameAttributeValue, {
    validateResponses: true,
  })
  renameAttributeValue(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      attributesContract.renameAttributeValue,
      async ({ body }) => {
        const result = await this.service.renameAttributeValue(body);
        this.audit.record('attribute.valueRenamed', user, {
          name: `${body.key}: ${body.from} → ${body.to} (${result.updated})`,
        });
        return { status: 200, body: result };
      },
    );
  }

  @TsRestHandler(attributesContract.createAttribute, {
    validateResponses: true,
  })
  createAttribute(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      attributesContract.createAttribute,
      async ({ body }) => {
        const definition = await this.service.createAttribute(body, user.id);
        this.audit.record('attribute.created', user, {
          id: definition.id,
          name: definition.name,
        });
        return { status: 201, body: definition };
      },
    );
  }

  @TsRestHandler(attributesContract.updateAttribute, {
    validateResponses: true,
  })
  updateAttribute(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      attributesContract.updateAttribute,
      async ({ params: { id }, body }) => {
        const definition = await this.service.updateAttribute(
          id,
          body,
          user.id,
        );
        this.audit.record('attribute.updated', user, {
          id: definition.id,
          name: definition.name,
        });
        return { status: 200, body: definition };
      },
    );
  }

  @TsRestHandler(attributesContract.reorderAttributes, {
    validateResponses: true,
  })
  reorderAttributes(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      attributesContract.reorderAttributes,
      async ({ body }) => {
        const definitions = await this.service.reorderAttributes(body, user.id);
        this.audit.record('attribute.reordered', user, {});
        return { status: 200, body: { definitions } };
      },
    );
  }

  @TsRestHandler(attributesContract.deleteAttribute, {
    validateResponses: true,
  })
  deleteAttribute(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      attributesContract.deleteAttribute,
      async ({ params: { id } }) => {
        const body = await this.service.deleteAttribute(id);
        this.audit.record('attribute.deleted', user, { id });
        return { status: 200, body };
      },
    );
  }
}
