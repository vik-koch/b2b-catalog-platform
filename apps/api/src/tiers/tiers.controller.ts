import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser, tiersContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
import { refusals } from '../orpc/refusals';
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
  @Implement(tiersContract.listTiers)
  listTiers() {
    return implement(tiersContract.listTiers).handler(() =>
      this.service.listTiers(),
    );
  }

  @Auth('admin')
  @Implement(tiersContract.createTier)
  createTier(@CurrentUser() user: AuthUser) {
    return implement(tiersContract.createTier)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const tier = await this.service.createTier(body, user.id);
        this.audit.record('tier.created', user, {
          id: tier.id,
          name: tier.label,
        });
        return tier;
      });
  }

  @Auth('admin')
  @Implement(tiersContract.updateTier)
  updateTier(@CurrentUser() user: AuthUser) {
    return implement(tiersContract.updateTier)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const tier = await this.service.updateTier(params.id, body, user.id);
        this.audit.record('tier.updated', user, {
          id: tier.id,
          name: tier.label,
        });
        return tier;
      });
  }

  @Auth('admin')
  @Implement(tiersContract.reorderTiers)
  reorderTiers(@CurrentUser() user: AuthUser) {
    return implement(tiersContract.reorderTiers)
      .use(refusals)
      .handler(async ({ input: { body } }) => {
        const tiers = await this.service.reorderTiers(body, user.id);
        this.audit.record('tier.reordered', user, {});
        return { tiers };
      });
  }

  @Auth('admin')
  @Implement(tiersContract.deleteTier)
  deleteTier(@CurrentUser() user: AuthUser) {
    return implement(tiersContract.deleteTier)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const result = await this.service.deleteTier(params.id);
        this.audit.record('tier.deleted', user, { id: params.id });
        return result;
      });
  }
}
