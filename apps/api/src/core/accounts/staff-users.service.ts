import {
  BadRequestException,
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

import {
  COMPANY_ID_NONE,
  CreateUserRequest,
  CustomerType,
  StaffUser,
  UpdateUserRequest,
  UserKind,
} from '@b2b-catalog-platform/shared/core/accounts';
import {
  alternateLayoutQuery,
  CompanyIdFormat,
  companyIdFormatOf,
  KeyboardLayout,
  UserRole,
} from '@b2b-catalog-platform/shared/platform';

import {
  ALTERNATE_LAYOUT,
  COMPANY_ID_FORMATS,
  PHONE_RULE,
  PhoneRule,
} from '../../platform/config/deployment-config';
import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';
import { isUniqueViolation } from '../../platform/db/pg-errors';
import { qualified } from '../../platform/db/sql-columns';
import { withdrawAccountConsents } from '../site/consent-withdrawals';
import { AccountErasure } from './account-erasure';
import { ACCEPTED_CUSTOMER_TYPES } from './accounts-config';
import { users } from './accounts-schema';
import { storedPhone } from './stored-phone';
import { UsersService } from './users.service';

/** A function, so each throw carries its own stack. */
const notFound = () =>
  new NotFoundException({
    code: 'account-not-found',
    message: 'Account not found',
  });

/** The source key is the exchange's only identity for an account (FR-ADM-14),
 * so the column is unique. */
const sourceIdTaken = () =>
  new ConflictException({
    code: 'source-id-taken',
    message: 'Another account already carries that source key',
  });

/** What the account list and every mutation answer with. */
const staffUserColumns = {
  id: users.id,
  email: users.email,
  sourceId: users.sourceId,
  role: users.role,
  status: users.status,
  firstName: users.firstName,
  lastName: users.lastName,
  phone: users.phone,
  customerType: users.customerType,
  companyName: users.companyName,
  companyRegistrationId: users.companyRegistrationId,
  tierId: users.tierId,
  createdAt: users.createdAt,
  approvedAt: users.approvedAt,
  approvedBy: users.approvedBy,
  phoneConfirmedAt: users.phoneConfirmedAt,
  signInStepExemptAt: users.signInStepExemptAt,
  /** Qualified throughout: a bare id would compare the admin's row with
   * itself. */
  signInStepExemptBy: sql<
    string | null
  >`(select ${qualified(users.email, 'exemptor')} from ${users} "exemptor" where ${qualified(users.id, 'exemptor')} = ${qualified(users.signInStepExemptBy)})`,
};

type StaffUserRow = {
  [
    K in Exclude<keyof typeof staffUserColumns, 'signInStepExemptBy'>
  ]: (typeof users.$inferSelect)[K];
} & { signInStepExemptBy: string | null };

export interface ListUsersFilters {
  /** `customer` = the `user` role; `staff` = admin and manager. */
  readonly kind?: UserKind;
  readonly status?: StaffUser['status'];
  readonly role?: UserRole;
  /** A tier id, or `'default'` for the base price list (a null `tierId`). */
  readonly tierId?: string;
  /** A `companyIdInput.formats` key: the shape the number is in. */
  readonly companyIdFormat?: string;
  readonly q?: string;
}

/**
 * The staff view of accounts (FR-AUTH-03/04). Never a password: only its
 * owner sets one, through a link. A staff-made account's stand-in hash is
 * passed in, not made here.
 */
@Injectable()
export class StaffUsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly users: UsersService,
    private readonly erasure: AccountErasure,
    @Inject(COMPANY_ID_FORMATS)
    private readonly companyIdFormats: readonly CompanyIdFormat[],
    @Inject(ALTERNATE_LAYOUT)
    private readonly alternateLayout: KeyboardLayout | null,
    @Inject(PHONE_RULE) private readonly phoneRule: PhoneRule,
    @Inject(ACCEPTED_CUSTOMER_TYPES)
    private readonly customerTypes: readonly CustomerType[],
  ) {}

  async list(filters: ListUsersFilters): Promise<StaffUser[]> {
    const conditions: SQL[] = [];
    if (filters.kind === 'customer') {
      conditions.push(eq(users.role, 'user'));
    } else if (filters.kind === 'staff') {
      conditions.push(inArray(users.role, ['admin', 'manager']));
    }
    // Tombstones only when asked for: no row action applies to one.
    conditions.push(
      filters.status
        ? eq(users.status, filters.status)
        : ne(users.status, 'anonymized'),
    );
    if (filters.role) conditions.push(eq(users.role, filters.role));
    if (filters.tierId) {
      conditions.push(
        filters.tierId === 'default'
          ? isNull(users.tierId)
          : eq(users.tierId, filters.tierId),
      );
    }
    if (filters.q) {
      const mapped = alternateLayoutQuery(filters.q, this.alternateLayout);
      conditions.push(
        or(
          ...[filters.q, ...(mapped === null ? [] : [mapped])].flatMap(
            (text) => {
              const like = `%${text}%`;
              return [
                ilike(users.email, like),
                ilike(users.firstName, like),
                ilike(users.lastName, like),
                ilike(users.companyName, like),
                ilike(users.companyRegistrationId, like),
              ];
            },
          ),
        ) as SQL,
      );
    }

    const rows = await this.db
      .select(staffUserColumns)
      .from(users)
      .where(conditions.length ? and(...conditions) : undefined)
      // Newest first: what brings staff here is a registration just in.
      .orderBy(desc(users.createdAt), asc(users.id));

    return this.narrowToFormat(rows.map(toStaffUser), filters.companyIdFormat);
  }

  /**
   * In JS, not SQL: the patterns are browser regexes, which Postgres's `~`
   * reads differently on all but the simplest. Affordable while the list is
   * unpaged; paging it moves this into the query.
   */
  private narrowToFormat(
    accounts: StaffUser[],
    key: string | undefined,
  ): StaffUser[] {
    if (!key) return accounts;
    // No number at all, which no pattern can match.
    if (key === COMPANY_ID_NONE) {
      return accounts.filter((account) => !account.companyRegistrationId);
    }
    return accounts.filter(
      (account) =>
        companyIdFormatOf(account.companyRegistrationId, this.companyIdFormats)
          ?.key === key,
    );
  }

  /**
   * Approve a registration with the tier staff chose. `invited`, not
   * `active`: it has no password of its own until the invitation is redeemed.
   * Only from `pending`, so a double click cannot re-tier it.
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
        ? new ConflictException({
            code: 'account-not-pending',
            message: 'Only a pending registration can be approved',
          })
        : notFound();
    }
    return toStaffUser(updated);
  }

  /** Whether the shop sells to this kind of customer (FR-AUTH-13). No type
   * means no company, so it is held to the list as a person. */
  private assertCustomerType(type: CustomerType | null | undefined): void {
    if (!this.customerTypes.includes(type ?? 'person')) {
      throw new BadRequestException({
        code: 'customer-type-not-accepted',
        message: 'This shop does not sell to that kind of customer',
      });
    }
  }

  /**
   * Create an account outright: a colleague, or a customer who arranged it by
   * phone. `invited`, like an approved registration: staff never choose
   * someone else's password.
   */
  async create(
    input: CreateUserRequest,
    createdBy: string,
    unusablePasswordHash: string,
  ): Promise<StaffUser> {
    const customer = input.role === 'user';
    if (customer) this.assertCustomerType(input.customerType);

    if (await this.users.findByEmail(input.email)) {
      throw new ConflictException({
        code: 'email-taken',
        message: 'That email address already has an account',
      });
    }

    // A tier and a source key are a customer's, as in `update`.
    const sourceId = customer ? (input.sourceId ?? null) : null;
    if (sourceId !== null) await this.assertSourceIdFree(sourceId);

    const [created] = await this.db
      .insert(users)
      .values({
        email: input.email.trim().toLowerCase(),
        passwordHash: unusablePasswordHash,
        role: input.role,
        sourceId,
        status: 'invited',
        tierId: customer ? input.tierId : null,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: storedPhone(this.phoneRule, input.phone) ?? null,
        customerType: input.customerType ?? null,
        companyName: input.companyName?.trim() ?? null,
        companyRegistrationId: input.companyRegistrationId ?? null,
        approvedAt: new Date(),
        approvedBy: createdBy,
      })
      .returning(staffUserColumns);
    return toStaffUser(created);
  }

  /** Exempt an account from the sign-in step, or ask it again (FR-AUTH-12).
   * Whether its role may be exempted is the caller's check. */
  async setSignInStepExemption(
    id: string,
    exempt: boolean,
    actorId: string,
  ): Promise<StaffUser> {
    const [updated] = await this.db
      .update(users)
      .set(
        exempt
          ? { signInStepExemptAt: new Date(), signInStepExemptBy: actorId }
          : { signInStepExemptAt: null, signInStepExemptBy: null },
      )
      .where(eq(users.id, id))
      .returning(staffUserColumns);
    if (!updated) throw notFound();
    return toStaffUser(updated);
  }

  /**
   * Edit an account: the whole editable set in one write. An omitted role
   * keeps the stored one. A tier and a source key are a customer's, so a
   * promotion out of `user` clears both: a staff account the exchange could
   * address is one it could tier, disable or re-mail.
   */
  async update(
    id: string,
    input: UpdateUserRequest,
    actorId: string,
  ): Promise<StaffUser> {
    const current = await this.findById(id);
    if (!current) throw notFound();
    if (current.status === 'anonymized') {
      throw new ConflictException({
        code: 'account-closed',
        message: 'A closed account can no longer be edited',
      });
    }

    const role = input.role ?? current.role;
    if (
      current.id === actorId &&
      current.role === 'admin' &&
      role !== 'admin'
    ) {
      throw new ConflictException({
        code: 'self-demote',
        message: 'An admin cannot take the admin role from their own account',
      });
    }
    // On every save, so an account from before the shop narrowed its
    // customers is put right the next time staff touch it.
    if (role === 'user') this.assertCustomerType(input.customerType);
    const phone = storedPhone(this.phoneRule, input.phone, current.phone);

    const sourceId =
      role === 'user'
        ? input.sourceId !== undefined
          ? input.sourceId
          : current.sourceId
        : null;
    if (sourceId !== null && sourceId !== current.sourceId) {
      await this.assertSourceIdFree(sourceId, id);
    }

    const apply = async (tx: Pick<typeof this.db, 'update'>) => {
      const [updated] = await tx
        .update(users)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          phone,
          customerType: input.customerType,
          companyName: input.companyName?.trim() ?? null,
          companyRegistrationId: input.companyRegistrationId,
          tierId: role === 'user' ? input.tierId : null,
          sourceId,
          role,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning(staffUserColumns);
      return toStaffUser(updated);
    };

    // A demotion out of `admin` is an admin removal like any other.
    try {
      return await (current.role === 'admin' && role !== 'admin'
        ? this.users.removingAdmin(id, apply)
        : apply(this.db));
    } catch (error) {
      // The race past the check above: same refusal, not a 500.
      if (isUniqueViolation(error)) throw sourceIdTaken();
      throw error;
    }
  }

  /** Checked as well as indexed, so the ordinary case gets a refusal an admin
   * can read. */
  private async assertSourceIdFree(
    sourceId: string,
    selfId?: string,
  ): Promise<void> {
    const [holder] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.sourceId, sourceId))
      .limit(1);
    if (holder && holder.id !== selfId) throw sourceIdTaken();
  }

  /**
   * Switch an account off, `active` or `invited`. Not anonymization: the
   * account stays whole and comes back as it was. The password stays too,
   * so switching it back on needs no mail; the `tokenVersion` bump is what
   * ends the sessions already open.
   */
  async deactivate(id: string, actorId: string): Promise<StaffUser> {
    const current = await this.findById(id);
    if (!current) throw notFound();
    if (current.status !== 'active' && current.status !== 'invited') {
      throw new ConflictException({
        code: 'account-not-approved',
        message: 'Only an approved account can be switched off',
      });
    }
    if (id === actorId) {
      throw new ConflictException({
        code: 'self-deactivate',
        message: 'An account cannot deactivate itself',
      });
    }
    const updated = await this.users.removingAdmin(id, async (tx) => {
      const [row] = await tx
        .update(users)
        .set({
          status: 'disabled',
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning(staffUserColumns);
      return row;
    });
    return toStaffUser(updated);
  }

  /**
   * Switch it back on: `active` where its owner chose a password, `invited`
   * where none was ever chosen, and staff send a link. `passwordSetAt` is the
   * only tell: the stand-in hash is a real argon2 hash. Approval, role and
   * tier are left as they were.
   */
  async reactivate(id: string): Promise<StaffUser> {
    const [updated] = await this.db
      .update(users)
      .set({
        status: sql`case when ${users.passwordSetAt} is null then 'invited' else 'active' end::user_status`,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, id), eq(users.status, 'disabled')))
      .returning(staffUserColumns);

    if (!updated) {
      throw (await this.exists(id))
        ? new ConflictException({
            code: 'account-not-disabled',
            message: 'Only a deactivated account can be switched back on',
          })
        : notFound();
    }
    return toStaffUser(updated);
  }

  /**
   * Decline a registration and remove it. Only a `pending` row: nothing
   * references it, and a declined stranger's details are not worth keeping.
   * Anything approved is anonymized instead (FR-AUTH-06).
   */
  async purgePending(
    id: string,
    by: { readonly id: string; readonly email: string },
  ): Promise<void> {
    const deleted = await this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(users)
        .where(and(eq(users.id, id), eq(users.status, 'pending')))
        .returning({ id: users.id });
      // The consent record outlives the row, for the retention period.
      if (rows.length) {
        await withdrawAccountConsents(tx, id, 'registration-declined');
        await this.erasure.erase(tx, {
          userId: id,
          kind: 'registration',
          reason: 'registration-declined',
          by,
        });
      }
      return rows;
    });

    if (!deleted.length) {
      throw (await this.exists(id))
        ? new ConflictException({
            code: 'account-not-purgeable',
            message:
              'Only a pending registration can be deleted; approved accounts are anonymized',
          })
        : notFound();
    }
  }

  async findById(id: string): Promise<StaffUser | undefined> {
    const [row] = await this.db
      .select(staffUserColumns)
      .from(users)
      .where(eq(users.id, id));
    return row && toStaffUser(row);
  }

  private async exists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id));
    return Boolean(row);
  }
}

const toStaffUser = (row: StaffUserRow): StaffUser => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  approvedAt: row.approvedAt?.toISOString() ?? null,
  phoneConfirmedAt: row.phoneConfirmedAt?.toISOString() ?? null,
  signInStepExemptAt: row.signInStepExemptAt?.toISOString() ?? null,
});
