import { Controller, ForbiddenException } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import {
  AuthUser,
  SyncArea,
  UserRole,
  syncContract,
} from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { refusals } from '../orpc/refusals';
import { SyncService } from './sync.service';

/**
 * Which areas' runs a role may read — and decide about (FR-ADM-09).
 *
 * | role    | catalog | customers |
 * | ------- | ------- | --------- |
 * | admin   | yes     | yes       |
 * | manager | no      | yes       |
 * | user    | no      | no        |
 *
 * An area's log is readable by whoever may do that area's work by hand: the
 * catalog is an admin's, a customer account is a manager's too. The same table
 * decides who may apply or discard a staged run of it, because answering a run
 * is that work arriving by another route. Written as a
 * `Record<UserRole, …>` for the reason the work counts are — a new role has to
 * name its areas to compile, and an area named by nobody is simply refused,
 * which is the safe direction to fail in.
 *
 * It is a check in the handler rather than a guard because the rule is about
 * the *run*, not the route: the list is narrowed by an area in the query, and
 * a run's own page is one route serving every area (ADR 0060). The guard above
 * still does the coarse half — nobody but staff reaches either.
 */
const READABLE_AREAS: Record<UserRole, readonly SyncArea[]> = {
  admin: ['catalog', 'customers', 'orders'],
  // The two areas a manager does by hand are the two whose exchange they may
  // read (FR-ADM-09): an order run is the work on their own desk arriving from
  // somewhere else.
  manager: ['customers', 'orders'],
  user: [],
};

/**
 * The runs themselves, whatever area they belong to: reading the log, reading
 * one run, and the two decisions a person makes on a staged one.
 *
 * Area-blind like the service behind it — an area's own entry points are its
 * own controller's (the catalog upload next door, and a machine controller per
 * area). What lives here instead is the rule about *who may see which area*,
 * which is the one thing every one of these routes needs and no area owns.
 *
 * `@Auth('admin')` at class level is the floor; the routes a manager shares
 * widen it themselves.
 */
@Auth('admin')
@Controller()
export class SyncController {
  constructor(private readonly service: SyncService) {}

  /**
   * Apply a staged run — whichever area it belongs to.
   *
   * Open to a manager for the same reason reading is: a staged run is work
   * awaiting attention, and the person who may do that area's work by hand is
   * the person who may answer a run of it. The area is read off the run and
   * checked against them, so a manager can apply a customer run and still
   * cannot touch a catalog one.
   */
  @Auth('admin', 'manager')
  @Implement(syncContract.commitRun)
  commitRun(@CurrentUser() user: AuthUser) {
    return implement(syncContract.commitRun)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        await this.assertMayAct(user, params.id);
        return this.service.commit(params.id, {
          id: user.id,
          email: user.email,
        });
      });
  }

  @Auth('admin', 'manager')
  @Implement(syncContract.discardRun)
  discardRun(@CurrentUser() user: AuthUser) {
    return implement(syncContract.discardRun)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        await this.assertMayAct(user, params.id);
        return this.service.discard(params.id, {
          id: user.id,
          email: user.email,
        });
      });
  }

  /**
   * Whether this reader may decide about this run. Costs one read of the run
   * before the one the action itself does, which is the price of the rule
   * living on the run rather than on the route.
   */
  private async assertMayAct(user: AuthUser, id: string): Promise<void> {
    this.assertMayRead(user, await this.service.areaOf(id));
  }

  /**
   * One run, whatever area it belongs to — the area is read off the run and
   * checked against the reader, so a mailed link to a staged run works for
   * whoever was asked to answer it and for nobody else.
   */
  @Auth('admin', 'manager')
  @Implement(syncContract.getRun)
  getRun(@CurrentUser() user: AuthUser) {
    return implement(syncContract.getRun)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const result = await this.service.getRun(params.id);
        this.assertMayRead(user, result.run.area);
        return result;
      });
  }

  @Auth('admin', 'manager')
  @Implement(syncContract.listRuns)
  listRuns(@CurrentUser() user: AuthUser) {
    return implement(syncContract.listRuns)
      .use(refusals)
      .handler(({ input: { query } }) => {
        this.assertMayRead(user, query.area);
        return this.service.listRuns(query.page, query.area, query.status);
      });
  }

  private assertMayRead(user: AuthUser, area: SyncArea): void {
    if (!READABLE_AREAS[user.role].includes(area)) {
      throw new ForbiddenException({
        code: 'insufficient-role',
        message: 'This area of the sync log is not yours to read',
      });
    }
  }
}
