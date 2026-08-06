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
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CreateUserRequest,
  StaffUser,
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
 * approving manager works with; it never touches `passwordHash` — a password
 * is only ever set by its own owner, through a token (see
 * PasswordTokenService), so there is nothing here that could set one.
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

  /** Re-tier a customer. Staff accounts carry a null tier and are left alone. */
  async setTier(id: string, tierId: string | null): Promise<StaffUser> {
    const [updated] = await this.db
      .update(users)
      .set({ tierId, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning(staffUserColumns);
    if (!updated) throw new NotFoundException('Account not found');
    return toStaffUser(updated);
  }

  /**
   * Promote or demote. Two refusals, both about not locking the deployment out
   * of its own admin panel: an admin cannot demote themselves (a slip that
   * would take their own access with it), and the last admin cannot be demoted
   * by anyone.
   */
  async setRole(
    id: string,
    role: UserRole,
    actorId: string,
  ): Promise<StaffUser> {
    const current = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, id));
    if (!current.length) throw new NotFoundException('Account not found');

    if (current[0].role === 'admin' && role !== 'admin') {
      if (id === actorId) {
        throw new ConflictException(
          'You cannot take the admin role from your own account',
        );
      }
      if (!(await this.hasAnotherAdmin(id))) {
        throw new ConflictException(
          'This is the last admin account; promote another one first',
        );
      }
    }

    const [updated] = await this.db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning(staffUserColumns);
    return toStaffUser(updated);
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
