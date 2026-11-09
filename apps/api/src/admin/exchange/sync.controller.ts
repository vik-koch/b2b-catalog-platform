import { Controller, ForbiddenException } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';

import { adminSyncContract } from '@b2b-catalog-platform/shared/admin/exchange';
import { SyncArea } from '@b2b-catalog-platform/shared/core/exchange';
import { AuthUser, UserRole } from '@b2b-catalog-platform/shared/platform';

import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { refusals } from '../../platform/orpc/refusals';
import { SyncService } from './sync.service';

/**
 * Whose runs a role may read and answer (FR-ADM-09): whoever does that area's
 * work by hand. A `Record` so a new role must name its areas to compile.
 */
const READABLE_AREAS: Record<UserRole, readonly SyncArea[]> = {
  admin: ['catalog', 'customers', 'orders'],
  manager: ['customers', 'orders'],
  user: [],
};

/**
 * The runs of every area: the log, one run, and the decisions on a staged
 * one. The role check is not a guard because the area is the run's, not the
 * route's; the service calls it as soon as it knows the area.
 */
@Auth('admin', 'manager')
@Controller()
export class SyncController {
  constructor(private readonly service: SyncService) {}

  @Implement(adminSyncContract.commitRun)
  commitRun(@CurrentUser() user: AuthUser) {
    return implement(adminSyncContract.commitRun)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.service.commit(params.id, user, mayRead(user)),
      );
  }

  @Implement(adminSyncContract.discardRun)
  discardRun(@CurrentUser() user: AuthUser) {
    return implement(adminSyncContract.discardRun)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.service.discard(params.id, user, mayRead(user)),
      );
  }

  @Implement(adminSyncContract.getRun)
  getRun(@CurrentUser() user: AuthUser) {
    return implement(adminSyncContract.getRun)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.service.getRun(params.id, mayRead(user)),
      );
  }

  @Implement(adminSyncContract.listRuns)
  listRuns(@CurrentUser() user: AuthUser) {
    return implement(adminSyncContract.listRuns)
      .use(refusals)
      .handler(({ input: { query } }) => {
        mayRead(user)(query.area);
        return this.service.listRuns(query.page, query.area, query.status);
      });
  }
}

function mayRead(user: AuthUser): (area: SyncArea) => void {
  return (area) => {
    if (!READABLE_AREAS[user.role].includes(area)) {
      throw new ForbiddenException({
        code: 'insufficient-role',
        message: 'This area of the sync log is not yours to read',
      });
    }
  };
}
