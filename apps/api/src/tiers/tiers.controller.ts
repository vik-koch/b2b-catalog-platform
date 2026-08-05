import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { AuthUser, tiersContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
import { TiersService } from './tiers.service';

/**
 * Admin-only throughout: a tier is a pricing decision, and creating one is how
 * a deployment's price lists come into existence. Managers assign a customer
 * to a tier (phase 3) but do not define the set.
 */
@Auth('admin')
@Controller()
export class TiersController {
  constructor(
    private readonly service: TiersService,
    private readonly audit: AuditLogger,
  ) {}

  @TsRestHandler(tiersContract.listTiers, { validateResponses: true })
  listTiers() {
    return tsRestHandler(tiersContract.listTiers, async () => {
      return { status: 200, body: await this.service.listTiers() };
    });
  }

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

  @TsRestHandler(tiersContract.reorderTiers, { validateResponses: true })
  reorderTiers(@CurrentUser() user: AuthUser) {
    return tsRestHandler(tiersContract.reorderTiers, async ({ body }) => {
      const tiers = await this.service.reorderTiers(body, user.id);
      this.audit.record('tier.reordered', user, {});
      return { status: 200, body: { tiers } };
    });
  }

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
