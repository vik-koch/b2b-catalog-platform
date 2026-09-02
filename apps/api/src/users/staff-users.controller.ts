import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import {
  AuthUser,
  StaffUser,
  usersContract,
} from '@b2b-catalog-platform/shared';

/** What a plain `user.updated` line covers — everything but role and tier. */
const PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'customerType',
  'companyName',
  'companyRegistrationId',
] as const satisfies readonly (keyof StaffUser)[];
import { AuditLogger } from '../audit/audit.logger';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { refusals } from '../orpc/refusals';
import { AccountInvitations } from './account-invitations';
import { StaffUsersService } from './staff-users.service';

/** Unknown, and staff seen by a manager. One refusal for both: the list hides
 * staff from a manager, so telling them apart here would undo that. */
const NOT_FOUND = { message: 'Account not found' };

/**
 * Account management (FR-AUTH-03/04, NFR-SEC-04).
 *
 * The class guard is the *customer* permission — admin and manager both decide
 * who becomes a customer and what they pay. Deciding who is **staff** is a
 * different power, kept to admins throughout: a manager who could grant a role
 * could promote themselves out of this split. Since every handler here takes an
 * account id, that boundary is checked against the *stored* row (`mayManage`),
 * never against what the request claims the target is.
 */
@Auth('admin', 'manager')
@Controller()
export class StaffUsersController {
  constructor(
    private readonly service: StaffUsersService,
    private readonly invitations: AccountInvitations,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(usersContract.listUsers)
  listUsers(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.listUsers)
      .use(refusals)
      .handler(async ({ input: { query } }) => {
        // A manager may only ever see customers. Forced here, not just hidden
        // in the UI: the route guard stops an honest click, this stops a
        // crafted request that asks for `kind=staff` or filters by an admin
        // role.
        const scoped =
          actor.role === 'manager'
            ? { ...query, kind: 'customer' as const, role: undefined }
            : query;
        return { users: await this.service.list(scoped) };
      });
  }

  @Implement(usersContract.approveUser)
  approveUser(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.approveUser)
      .use(refusals)
      .handler(async ({ input: { params, body }, errors }) => {
        const id = params.id;
        const pending = await this.service.findById(id);
        if (!pending || !this.mayManage(actor, pending)) {
          throw errors['account-not-found'](NOT_FOUND);
        }
        const user = await this.service.approve(id, body.tierId, actor.id);
        this.audit.record('user.approved', actor, {
          id: user.id,
          name: user.email,
        });
        await this.invitations.send(user, 'approved');
        return user;
      });
  }

  @Implement(usersContract.createUser)
  createUser(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.createUser)
      .use(refusals)
      .handler(async ({ input: { body }, errors }) => {
        // The same admin-only rule as editing a role, at the other door: a
        // manager who could *create* an admin would not need to grant one.
        if (body.role !== 'user' && actor.role !== 'admin') {
          throw errors['staff-create-admin-only']({
            message: 'Only an admin can create a staff account',
          });
        }
        const user = await this.invitations.create(body, actor.id);
        this.audit.record('user.created', actor, {
          id: user.id,
          name: user.email,
        });
        return user;
      });
  }

  @Implement(usersContract.getUser)
  getUser(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.getUser)
      .use(refusals)
      .handler(async ({ input: { params }, errors }) => {
        const user = await this.service.findById(params.id);
        // A staff account is *not found* for a manager rather than forbidden:
        // the list hides them, so confirming one exists here would undo that.
        if (!user || !this.mayManage(actor, user)) {
          throw errors['account-not-found'](NOT_FOUND);
        }
        return user;
      });
  }

  @Implement(usersContract.updateUser)
  updateUser(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.updateUser)
      .use(refusals)
      .handler(async ({ input: { params, body }, errors }) => {
        const id = params.id;
        const before = await this.service.findById(id);
        if (!before || !this.mayManage(actor, before)) {
          throw errors['account-not-found'](NOT_FOUND);
        }
        // Deciding who is *staff* is the one power this surface withholds from
        // a manager — one who could grant a role could promote themselves. The
        // field is refused outright, never dropped, so a refusal cannot read as
        // a save.
        if (body.role !== undefined && actor.role !== 'admin') {
          throw errors['role-change-admin-only']({
            message: 'Only an admin can change a role',
          });
        }

        const user = await this.service.update(id, body, actor.id);
        this.recordUpdate(actor, before, user);
        return user;
      });
  }

  /**
   * One edit, up to three audit lines. Role and tier keep their own actions
   * because they are the questions an auditor actually asks — who granted this
   * role, who put this customer on that price list — and burying them in a
   * generic "updated" would make them ungreppable.
   */
  private recordUpdate(
    actor: AuthUser,
    before: StaffUser,
    after: StaffUser,
  ): void {
    const entity = { id: after.id, name: after.email };
    if (after.role !== before.role) {
      this.audit.record('user.roleChanged', actor, {
        ...entity,
        name: `${after.email} → ${after.role}`,
      });
    }
    if (after.tierId !== before.tierId) {
      this.audit.record('user.tierChanged', actor, entity);
    }
    if (PROFILE_FIELDS.some((field) => after[field] !== before[field])) {
      this.audit.record('user.updated', actor, entity);
    }
  }

  /**
   * A manager reaches customers only. Enforced against the *stored* row, not
   * the requested one: the list's `kind` filter is a query a crafted request
   * can simply omit, whereas the target's own role cannot be argued with.
   */
  private mayManage(actor: AuthUser, target: StaffUser): boolean {
    return actor.role === 'admin' || target.role === 'user';
  }

  /**
   * Switching an account off, and back on. Both directions go through
   * AccountInvitations rather than the service alone: off has to retire the
   * links that are out, and on has to send a new one, because the account
   * comes back with no password of its own.
   */
  @Implement(usersContract.setUserActive)
  setUserActive(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.setUserActive)
      .use(refusals)
      .handler(async ({ input: { params, body }, errors }) => {
        const id = params.id;
        const target = await this.service.findById(id);
        if (!target || !this.mayManage(actor, target)) {
          throw errors['account-not-found'](NOT_FOUND);
        }
        const user = body.active
          ? await this.invitations.reactivate(id)
          : await this.invitations.deactivate(id, actor.id);
        this.audit.record(
          body.active ? 'user.reactivated' : 'user.deactivated',
          actor,
          { id: user.id, name: user.email },
        );
        return user;
      });
  }

  @Implement(usersContract.resendInvitation)
  resendInvitation(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.resendInvitation)
      .use(refusals)
      .handler(async ({ input: { params }, errors }) => {
        const user = await this.service.findById(params.id);
        if (!user || !this.mayManage(actor, user)) {
          throw errors['account-not-found'](NOT_FOUND);
        }
        // Unlike an approval, the mail *is* the request: a failure here is
        // reported rather than swallowed, because nothing else happened.
        await this.invitations.resend(user);
        this.audit.record('user.invited', actor, {
          id: user.id,
          name: user.email,
        });
        return { message: 'Invitation sent' };
      });
  }

  @Implement(usersContract.deleteUser)
  deleteUser(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.deleteUser)
      .use(refusals)
      .handler(async ({ input: { params }, errors }) => {
        const id = params.id;
        const user = await this.service.findById(id);
        if (!user || !this.mayManage(actor, user)) {
          throw errors['account-not-found'](NOT_FOUND);
        }
        await this.service.purgePending(id);
        this.audit.record('user.declined', actor, { id, name: user.email });
        return { message: 'Registration declined' };
      });
  }
}
