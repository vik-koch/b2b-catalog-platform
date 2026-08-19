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
