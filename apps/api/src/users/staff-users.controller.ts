import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { AuthUser, usersContract } from '@b2b-catalog-platform/shared';
import { AuditLogger } from '../audit/audit.logger';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccountInvitations } from './account-invitations';
import { StaffUsersService } from './staff-users.service';

/**
 * Account management (FR-AUTH-03/04, NFR-SEC-04).
 *
 * The class guard is the *customer* permission — admin and manager both decide
 * who becomes a customer and what they pay. `setUserRole` narrows it to admin
 * on the method, because deciding who is **staff** is a different power: a
 * manager who could grant roles could promote themselves out of this split.
 */
@Auth('admin', 'manager')
@Controller()
export class StaffUsersController {
  constructor(
    private readonly service: StaffUsersService,
    private readonly invitations: AccountInvitations,
    private readonly audit: AuditLogger,
  ) {}

  @TsRestHandler(usersContract.listUsers, { validateResponses: true })
  listUsers() {
    return tsRestHandler(usersContract.listUsers, async ({ query }) => {
      return { status: 200, body: { users: await this.service.list(query) } };
    });
  }

  @TsRestHandler(usersContract.approveUser, { validateResponses: true })
  approveUser(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(
      usersContract.approveUser,
      async ({ params: { id }, body }) => {
        const user = await this.service.approve(id, body.tierId, actor.id);
        this.audit.record('user.approved', actor, {
          id: user.id,
          name: user.email,
        });
        await this.invitations.send(user, 'approved');
        return { status: 200, body: user };
      },
    );
  }

  @TsRestHandler(usersContract.createUser, { validateResponses: true })
  createUser(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(usersContract.createUser, async ({ body }) => {
      const user = await this.invitations.create(body, actor.id);
      this.audit.record('user.created', actor, {
        id: user.id,
        name: user.email,
      });
      return { status: 201, body: user };
    });
  }

  @TsRestHandler(usersContract.setUserTier, { validateResponses: true })
  setUserTier(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(
      usersContract.setUserTier,
      async ({ params: { id }, body }) => {
        const user = await this.service.setTier(id, body.tierId);
        this.audit.record('user.tierChanged', actor, {
          id: user.id,
          name: user.email,
        });
        return { status: 200, body: user };
      },
    );
  }

  // Admin only — the one action on this surface a manager may not take.
  @Auth('admin')
  @TsRestHandler(usersContract.setUserRole, { validateResponses: true })
  setUserRole(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(
      usersContract.setUserRole,
      async ({ params: { id }, body }) => {
        const user = await this.service.setRole(id, body.role, actor.id);
        this.audit.record('user.roleChanged', actor, {
          id: user.id,
          name: `${user.email} → ${user.role}`,
        });
        return { status: 200, body: user };
      },
    );
  }

  @TsRestHandler(usersContract.deleteUser, { validateResponses: true })
  deleteUser(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(
      usersContract.deleteUser,
      async ({ params: { id } }) => {
        const user = await this.service.findById(id);
        await this.service.purgePending(id);
        this.audit.record('user.declined', actor, {
          id,
          name: user?.email,
        });
        return { status: 200, body: { message: 'Registration declined' } };
      },
    );
  }
}
