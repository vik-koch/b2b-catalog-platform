import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AccountDeletion } from '../../core/accounts/account-deletion';
import { AuditLogger } from '../../audit/audit.logger';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { ConsentRecords } from './consent-records';
import { refusals } from '../../orpc/refusals';
import { customersExternallyOwned } from '../../core/site/ownership.refusals';
import { OwnershipState } from '../../core/site/ownership-state';
import { SignInStep } from '../../core/accounts/sign-in-step/sign-in-step';
import { AccountInvitations } from '../../core/accounts/account-invitations';
import { StaffUsersService } from '../../core/accounts/staff-users.service';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import { StaffUser } from '@b2b-catalog-platform/shared/core/accounts';
import { usersContract } from '@b2b-catalog-platform/shared/admin/accounts';

/** What a plain `user.updated` line covers. */
const PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'customerType',
  'companyName',
  'companyRegistrationId',
] as const satisfies readonly (keyof StaffUser)[];

/** Unknown, and staff seen by a manager. One refusal for both: the list hides
 * staff from a manager, so telling them apart here would undo that. */
const NOT_FOUND = { message: 'Account not found' };

/**
 * Account management (FR-AUTH-03/04, NFR-SEC-04). Admin and manager manage
 * customers; deciding who is staff is an admin's alone, or a manager could
 * promote themselves. Checked against the stored row (`mayManage`), never
 * against what the request claims.
 */
@Auth('admin', 'manager')
@Controller()
export class StaffUsersController {
  constructor(
    private readonly service: StaffUsersService,
    private readonly invitations: AccountInvitations,
    private readonly audit: AuditLogger,
    private readonly ownership: OwnershipState,
    private readonly consents: ConsentRecords,
    private readonly deletion: AccountDeletion,
    private readonly step: SignInStep,
  ) {}

  @Implement(usersContract.listUsers)
  listUsers(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.listUsers)
      .use(refusals)
      .handler(async ({ input: { query } }) => {
        // Forced, not only hidden: a crafted request could ask for staff.
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
        this.refuseIfOwned(pending, 'approve an account');
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
        // The role rule at the other door.
        if (body.role !== 'user' && actor.role !== 'admin') {
          throw errors['staff-create-admin-only']({
            message: 'Only an admin can create a staff account',
          });
        }
        // The source key decides which account an exchange addresses
        // (FR-ADM-14): a deployment act, not a manager's customer work.
        if (body.sourceId !== undefined && actor.role !== 'admin') {
          throw errors['source-id-change-admin-only']({
            message: 'Only an admin can change a source key',
          });
        }
        // No stored row yet: the requested role, already checked above.
        this.refuseIfOwned({ role: body.role }, 'create a customer account');
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
        if (!user || !this.mayManage(actor, user)) {
          throw errors['account-not-found'](NOT_FOUND);
        }
        return user;
      });
  }

  // Admin only, as the consent lookup is.
  @Auth('admin')
  @Implement(usersContract.listUserConsents)
  listUserConsents() {
    return implement(usersContract.listUserConsents).handler(
      async ({ input: { params }, errors }) => {
        const user = await this.service.findById(params.id);
        if (!user) throw errors['account-not-found'](NOT_FOUND);
        return { consents: await this.consents.findByAccount(user.id) };
      },
    );
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
        // Refused, never dropped, so a refusal cannot read as a save.
        if (body.role !== undefined && actor.role !== 'admin') {
          throw errors['role-change-admin-only']({
            message: 'Only an admin can change a role',
          });
        }
        if (body.sourceId !== undefined && actor.role !== 'admin') {
          throw errors['source-id-change-admin-only']({
            message: 'Only an admin can change a source key',
          });
        }
        this.refuseIfOwned(before, 'edit an account');

        const user = await this.service.update(id, body, actor.id);
        this.recordUpdate(actor, before, user);
        return user;
      });
  }

  /** Role, tier and source key get their own audit lines: they are what an
   * auditor asks about. */
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
    if (after.sourceId !== before.sourceId) {
      this.audit.record('user.sourceIdChanged', actor, {
        ...entity,
        name: `${after.email} → ${after.sourceId ?? '—'}`,
      });
    }
    if (PROFILE_FIELDS.some((field) => after[field] !== before[field])) {
      this.audit.record('user.updated', actor, entity);
    }
  }

  /** A manager reaches customers only, by the stored row's role. */
  private mayManage(actor: AuthUser, target: StaffUser): boolean {
    return actor.role === 'admin' || target.role === 'user';
  }

  /**
   * While an external system owns customers (FR-ADM-10), every write to one
   * is refused, not a list of columns: a list would miss the next handler.
   * Staff accounts and reads stay open.
   */
  private refuseIfOwned(target: { role: StaffUser['role'] }, action: string) {
    if (
      target.role === 'user' &&
      this.ownership.isExternallyOwned('customers')
    ) {
      throw customersExternallyOwned(action);
    }
  }

  /** Off retires the links too; on sends nothing, since the password
   * survived. */
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
        this.refuseIfOwned(
          target,
          body.active ? 'reactivate an account' : 'deactivate an account',
        );
        const user = body.active
          ? await this.service.reactivate(id)
          : await this.invitations.deactivate(id, actor.id);
        this.audit.record(
          body.active ? 'user.reactivated' : 'user.deactivated',
          actor,
          { id: user.id, name: user.email },
        );
        return user;
      });
  }

  @Implement(usersContract.sendPasswordLink)
  sendPasswordLink(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.sendPasswordLink)
      .use(refusals)
      .handler(async ({ input: { params }, errors }) => {
        const user = await this.service.findById(params.id);
        if (!user || !this.mayManage(actor, user)) {
          throw errors['account-not-found'](NOT_FOUND);
        }
        // Closed with the rest; the holder can still ask for one themselves.
        this.refuseIfOwned(user, 'send a password link');
        // The mail is the request, so a failure is reported.
        await this.invitations.sendPasswordLink(user);
        this.audit.record('user.invited', actor, {
          id: user.id,
          name: user.email,
        });
        return { message: 'Password link sent' };
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
        this.refuseIfOwned(user, 'decline a registration');
        await this.service.purgePending(id, actor);
        this.audit.record('user.declined', actor, { id, name: user.email });
        return { message: 'Registration declined' };
      });
  }

  /**
   * The holder's deletion, for a request that reached the shop (FR-ADM-23).
   * An admin's alone, as it cannot be undone. Open while customers are owned
   * elsewhere: the person's right outranks the switch.
   */
  @Auth('admin')
  @Implement(usersContract.deleteAccountOnRequest)
  deleteAccountOnRequest(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.deleteAccountOnRequest)
      .use(refusals)
      .handler(async ({ input: { params, body }, errors }) => {
        const result = await this.deletion.deleteOnRequest(
          params.id,
          actor,
          body.reason,
        );
        if (!result.ok) {
          switch (result.reason) {
            case 'not-found':
              throw errors['account-not-found'](NOT_FOUND);
            case 'self-delete':
              throw errors['self-delete']({
                message: 'Delete your own account from your account page',
              });
            case 'closed':
              throw errors['account-closed']({
                message: 'This account is already closed',
              });
            case 'pending':
              throw errors['account-pending']({
                message: 'Decline a pending registration instead',
              });
            case 'last-admin':
              throw errors['last-admin']({
                message: 'The last admin account cannot be deleted',
              });
          }
        }
        // The id only: the address is what was just erased.
        this.audit.record('user.deleted', actor, {
          id: params.id,
          reason: body.reason,
        });
        const user = await this.service.findById(params.id);
        if (!user) throw errors['account-not-found'](NOT_FOUND);
        return user;
      });
  }

  /** Exempting one account from the sign-in step, or asking it again
   * (FR-AUTH-12). An admin's alone, and only for an exemptable role. */
  @Auth('admin')
  @Implement(usersContract.setSignInStepExemption)
  setSignInStepExemption(@CurrentUser() actor: AuthUser) {
    return implement(usersContract.setSignInStepExemption)
      .use(refusals)
      .handler(async ({ input: { params, body }, errors }) => {
        const before = await this.service.findById(params.id);
        if (!before || !this.mayManage(actor, before)) {
          throw errors['account-not-found'](NOT_FOUND);
        }
        if (before.status === 'anonymized') {
          throw errors['account-closed']({
            message: 'This account is already closed',
          });
        }
        if (body.exempt && !this.step.mayExempt(before.role)) {
          throw errors['not-exemptable']({
            message: 'Accounts of this role cannot skip the code',
          });
        }
        const user = await this.service.setSignInStepExemption(
          params.id,
          body.exempt,
          actor.id,
        );
        this.audit.record(
          body.exempt ? 'user.signInStepExempted' : 'user.signInStepRequired',
          actor,
          { id: user.id, name: user.email },
        );
        return user;
      });
  }
}
