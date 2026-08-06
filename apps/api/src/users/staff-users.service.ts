import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  SQL,
  sql,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CreateUserRequest,
  StaffUser,
  UpdateUserRequest,
  UserKind,
  UserRole,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { users } from '../db/schema';

/** What the account list and every mutation answer with. */
const staffUserColumns = {
  id: users.id,
  email: users.email,
  role: users.role,
  status: users.status,
  firstName: users.firstName,
  lastName: users.lastName,
  phone: users.phone,
  customerType: users.customerType,
  companyRegistrationId: users.companyRegistrationId,
  tierId: users.tierId,
  createdAt: users.createdAt,
  approvedAt: users.approvedAt,
  approvedBy: users.approvedBy,
};

type StaffUserRow = {
  [K in keyof typeof staffUserColumns]: (typeof users.$inferSelect)[K];
};

export interface ListUsersFilters {
  /** `customer` = the `user` role; `staff` = admin and manager. */
  readonly kind?: UserKind;
  readonly status?: StaffUser['status'];
  readonly role?: UserRole;
  /** A tier id, or `'default'` for the base price list (a null `tierId`). */
  readonly tierId?: string;
  readonly q?: string;
}

/**
 * The staff view of accounts (FR-AUTH-03/04). Reads and writes the columns an
 * approving manager works with. It never sets a *password* — that is only ever
 * done by the account's own owner, through a token (see PasswordTokenService),
 * and there is nothing here that could hash one. The single write to
 * `passwordHash` is `deactivate`, which takes the unusable hash it stores as an
 * argument: taking a password away is a staff decision, choosing one is not.
 */
@Injectable()
export class StaffUsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async list(filters: ListUsersFilters): Promise<StaffUser[]> {
    const conditions: SQL[] = [];
    // The customer/staff boundary. A manager only ever reaches this with
    // `customer` (the controller forces it), so staff stay invisible to them.
    if (filters.kind === 'customer') {
      conditions.push(eq(users.role, 'user'));
    } else if (filters.kind === 'staff') {
      conditions.push(inArray(users.role, ['admin', 'manager']));
    }
    if (filters.status) conditions.push(eq(users.status, filters.status));
    // Narrows within the staff view; harmless-but-empty alongside `customer`.
    if (filters.role) conditions.push(eq(users.role, filters.role));
    if (filters.tierId) {
      conditions.push(
        filters.tierId === 'default'
          ? isNull(users.tierId)
          : eq(users.tierId, filters.tierId),
      );
    }
    if (filters.q) {
      const like = `%${filters.q}%`;
      // The same "one box, several columns" idea as the product grid: staff
      // look people up by whatever they happen to have — an address, a name
      // from a phone call, a number from an invoice.
      conditions.push(
        or(
          ilike(users.email, like),
          ilike(users.firstName, like),
          ilike(users.lastName, like),
          ilike(users.companyRegistrationId, like),
        ) as SQL,
      );
    }

    const rows = await this.db
      .select(staffUserColumns)
      .from(users)
      .where(conditions.length ? and(...conditions) : undefined)
      // Newest first: the reason to open this screen is a registration that
      // just arrived. `id` breaks ties so paging stays stable later.
      .orderBy(desc(users.createdAt), asc(users.id));

    return rows.map(toStaffUser);
  }

  /**
   * Approve a registration: assign the tier staff chose and move it to
   * `invited`. Not `active` — the account has no password of its own yet, and
   * redeeming the invitation is what makes it usable.
   *
   * Refuses anything that is not `pending`, so a double-click cannot re-approve
   * an account and quietly re-tier it, and an anonymized row can never come
   * back to life.
   */
  async approve(
    id: string,
    tierId: string | null,
    approvedBy: string,
  ): Promise<StaffUser> {
    const [updated] = await this.db
      .update(users)
      .set({
        status: 'invited',
        tierId,
        approvedAt: new Date(),
        approvedBy,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, id), eq(users.status, 'pending')))
      .returning(staffUserColumns);

    if (!updated) {
      throw (await this.exists(id))
        ? new ConflictException('Only a pending registration can be approved')
        : new NotFoundException('Account not found');
    }
    return toStaffUser(updated);
  }

  /**
   * Create an account outright — a colleague, or a customer who arranged
   * everything by phone. It starts `invited` with an unusable password hash,
   * exactly like an approved registration: staff never choose someone else's
   * password, so there is no state where one exists that two people know.
   */
  async create(
    input: CreateUserRequest,
    createdBy: string,
    unusablePasswordHash: string,
  ): Promise<StaffUser> {
    const email = input.email.trim().toLowerCase();
    if (await this.findByEmail(email)) {
      throw new ConflictException('That email address already has an account');
    }

    const [created] = await this.db
      .insert(users)
      .values({
        email,
        passwordHash: unusablePasswordHash,
        role: input.role,
        status: 'invited',
        tierId: input.tierId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        customerType: input.customerType ?? null,
        companyRegistrationId: input.companyRegistrationId ?? null,
        approvedAt: new Date(),
        approvedBy: createdBy,
      })
      .returning(staffUserColumns);
    return toStaffUser(created);
  }

  /**
   * Edit an account: the whole editable set in one write, so the screen that
   * shows these fields together saves them together.
   *
   * The role is applied only when the caller passed one — the controller has
   * already refused it from a manager, and an omitted role means "leave it",
   * not "make them a customer". A tier is meaningless on a staff account, so
   * promoting one out of `user` clears it rather than leaving a price group
   * attached to somebody who never sees prices.
   */
  async update(
    id: string,
    input: UpdateUserRequest,
    actorId: string,
  ): Promise<StaffUser> {
    const current = await this.findById(id);
    if (!current) throw new NotFoundException('Account not found');
    if (current.status === 'anonymized') {
      throw new ConflictException('A closed account can no longer be edited');
    }

    const role = input.role ?? current.role;
    if (input.role) await this.assertRoleChangeAllowed(current, role, actorId);

    const [updated] = await this.db
      .update(users)
      .set({
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        customerType: input.customerType,
        companyRegistrationId: input.companyRegistrationId,
        tierId: role === 'user' ? input.tierId : null,
        role,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning(staffUserColumns);
    return toStaffUser(updated);
  }

  /**
   * Switch an account off: the colleague who left, the customer who stopped
   * ordering. Everything that identifies them survives, so the audit trail and
   * every `approvedBy` reference still point at somebody — this is not
   * anonymization (FR-AUTH-06), which is final.
   *
   * Three writes, and each is load-bearing. The status is what login and the
   * guards read. The `tokenVersion` bump is the part that matters on the day
   * it is used: somebody who has just left holds a session cookie good for
   * another seven days, and a status change alone would not touch it. And the
   * password is replaced with an unusable hash, so "switched off" means the
   * credential is gone rather than dormant — which is why coming back is
   * `reactivate`'s job and lands on `invited`.
   *
   * Both `active` and `invited` accounts can be switched off: a colleague who
   * never opened their invitation still needs the account stopped. A `pending`
   * registration cannot — nobody has decided on it yet, so the actions are
   * approve and decline. Neither can an `anonymized` one.
   *
   * The guards mirror the role change's: you cannot switch yourself off, and
   * the last admin cannot be switched off by anyone.
   */
  async deactivate(
    id: string,
    actorId: string,
    unusableHash: string,
  ): Promise<StaffUser> {
    const current = await this.findById(id);
    if (!current) throw new NotFoundException('Account not found');
    if (current.status !== 'active' && current.status !== 'invited') {
      throw new ConflictException(
        'Only an approved account can be switched off',
      );
    }
    if (id === actorId) {
      throw new ConflictException('You cannot deactivate your own account');
    }
    if (current.role === 'admin' && !(await this.hasAnotherAdmin(id))) {
      throw new ConflictException(
        'This is the last admin account; promote another one first',
      );
    }

    const [updated] = await this.db
      .update(users)
      .set({
        status: 'disabled',
        // Not a sentinel — see PasswordService.unusableHash. Passed in rather
        // than made here so this class still has no way to *set* a password.
        passwordHash: unusableHash,
        // Ends every session already in flight, not just the next sign-in.
        tokenVersion: sql`${users.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning(staffUserColumns);
    return toStaffUser(updated);
  }

  /**
   * Switch it back on — to `invited`, not `active`. Deactivation retired the
   * password, so there is nothing to sign in with; the account holder chooses
   * a new one from a fresh link, exactly as they did the first time. Approval
   * is not revisited: role, tier, `approvedAt` and `approvedBy` are untouched,
   * because none of them stopped being true.
   *
   * That also keeps `active` meaning one thing everywhere — an account holding
   * a password its owner chose — and keeps a real customer out of `pending`,
   * where the staff action on offer is a purge.
   */
  async reactivate(id: string): Promise<StaffUser> {
    const current = await this.findById(id);
    if (!current) throw new NotFoundException('Account not found');
    if (current.status !== 'disabled') {
      throw new ConflictException(
        'Only a deactivated account can be switched back on',
      );
    }

    const [updated] = await this.db
      .update(users)
      .set({ status: 'invited', updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning(staffUserColumns);
    return toStaffUser(updated);
  }

  /**
   * The two refusals behind a role change, both about not locking the
   * deployment out of its own admin panel: an admin cannot demote themselves (a
   * slip that would take their own access with it), and the last admin cannot
   * be demoted by anyone.
   */
  private async assertRoleChangeAllowed(
    current: StaffUser,
    role: UserRole,
    actorId: string,
  ): Promise<void> {
    if (current.role !== 'admin' || role === 'admin') return;

    if (current.id === actorId) {
      throw new ConflictException(
        'You cannot take the admin role from your own account',
      );
    }
    if (!(await this.hasAnotherAdmin(current.id))) {
      throw new ConflictException(
        'This is the last admin account; promote another one first',
      );
    }
  }

  /**
   * Decline a registration and remove it. Only a `pending` row: it has never
   * been usable, so nothing references it and there is nothing to preserve —
   * and holding a rejected stranger's name and phone number indefinitely is
   * the wrong default. Anything that has been approved is anonymized instead
   * (FR-AUTH-06), never deleted.
   */
  async purgePending(id: string): Promise<void> {
    const deleted = await this.db
      .delete(users)
      .where(and(eq(users.id, id), eq(users.status, 'pending')))
      .returning({ id: users.id });

    if (!deleted.length) {
      throw (await this.exists(id))
        ? new ConflictException(
            'Only a pending registration can be deleted; approved accounts are anonymized',
          )
        : new NotFoundException('Account not found');
    }
  }

  async findById(id: string): Promise<StaffUser | undefined> {
    const [row] = await this.db
      .select(staffUserColumns)
      .from(users)
      .where(eq(users.id, id));
    return row && toStaffUser(row);
  }

  private async findByEmail(
    email: string,
  ): Promise<{ id: string } | undefined> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    return row;
  }

  private async exists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id));
    return Boolean(row);
  }

  private async hasAnotherAdmin(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, 'admin'),
          ne(users.id, id),
          // An anonymized admin is not somebody who can sign in and help.
          ne(users.status, 'anonymized'),
        ),
      );
    return Boolean(row);
  }
}

const toStaffUser = (row: StaffUserRow): StaffUser => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  approvedAt: row.approvedAt?.toISOString() ?? null,
});
