import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { AuthUser, tiersContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
import { TiersService } from './tiers.service';

/**
 * Defining the set of price lists is admin-only — a tier is a pricing decision.
 * A manager may *read* the list, because assigning a customer to a tier on
 * approval needs the names and ids; each mutation narrows back to admin on the
 * method.
 */
@Auth('admin', 'manager')
@Controller()
export class TiersController {
  constructor(
    private readonly service: TiersService,
    private readonly audit: AuditLogger,
  ) {}

  // Readable by managers (the class guard); the writes below are admin-only.
  @TsRestHandler(tiersContract.listTiers, { validateResponses: true })
  listTiers() {
    return tsRestHandler(tiersContract.listTiers, async () => {
      return { status: 200, body: await this.service.listTiers() };
    });
  }

  @Auth('admin')
  @TsRestHandler(tiersContract.createTier, { validateResponses: true })
  createTier(@CurrentUser() user: AuthUser) {
    return tsRestHandler(tiersContract.createTier, async ({ body }) => {
      const tier = await this.service.createTier(body, user.id);
      this.audit.record('tier.created', user, {
        id: tier.id,
        name: tier.label,
      });
      return { status: 201, body: tier };
    });
  }

  @Auth('admin')
  @TsRestHandler(tiersContract.updateTier, { validateResponses: true })
  updateTier(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      tiersContract.updateTier,
      async ({ params: { id }, body }) => {
        const tier = await this.service.updateTier(id, body, user.id);
        this.audit.record('tier.updated', user, {
          id: tier.id,
          name: tier.label,
        });
        return { status: 200, body: tier };
      },
    );
  }

  @Auth('admin')
  @TsRestHandler(tiersContract.reorderTiers, { validateResponses: true })
  reorderTiers(@CurrentUser() user: AuthUser) {
    return tsRestHandler(tiersContract.reorderTiers, async ({ body }) => {
      const tiers = await this.service.reorderTiers(body, user.id);
      this.audit.record('tier.reordered', user, {});
      return { status: 200, body: { tiers } };
    });
  }

  @Auth('admin')
  @TsRestHandler(tiersContract.deleteTier, { validateResponses: true })
  deleteTier(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      tiersContract.deleteTier,
      async ({ params: { id } }) => {
        const body = await this.service.deleteTier(id);
        this.audit.record('tier.deleted', user, { id });
        return { status: 200, body };
      },
    );
  }
}
