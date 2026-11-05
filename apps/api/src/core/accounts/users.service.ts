import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/db/database.module';
import { withdrawAccountConsents } from '../site/consent-withdrawals';
import { addresses, signInCodes, users } from './accounts-schema';
import { AccountErasure, Tx } from './account-erasure';
import { LastAdminError } from './last-admin-error';
import {
  CustomerType,
  AccountDeletionReason,
} from '@b2b-catalog-platform/shared/core/accounts';
import { Database } from '../../platform/db/database';

export type UserRow = typeof users.$inferSelect;

/**
 * What a self-registration writes: the identity staff need to decide on it, and
 * an unusable password hash standing in until they do.
 */
export interface PendingRegistration {
  readonly email: string;
  readonly passwordHash: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly customerType: CustomerType;
  readonly companyName: string | null;
  readonly companyRegistrationId: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly erasure: AccountErasure,
  ) {}

  async findById(id: string): Promise<UserRow | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    // Stored lowercased, so `Admin@x` and `admin@x` are one account.
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()));
    return rows[0];
  }

  /** A self-registered account (FR-AUTH-01): `pending`, without a tier until
   * staff approve it. */
  async createPending(registration: PendingRegistration): Promise<UserRow> {
    const [created] = await this.db
      .insert(users)
      .values({
        ...registration,
        email: registration.email.trim().toLowerCase(),
        role: 'user',
        status: 'pending',
      })
      .returning();
    return created;
  }

  /**
   * The password behind a redeemed link, which makes an `invited` account
   * `active`. Only from `invited` or `active`, so no link can activate a
   * `pending` registration or revive a tombstone. Otherwise as `setPassword`.
   */
  async setPasswordFromToken(
    id: string,
    passwordHash: string,
    db: Pick<Tx, 'update'> = this.db,
  ): Promise<UserRow | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        passwordHash,
        status: 'active',
        // What a reactivation reads to tell `active` from `invited`.
        passwordSetAt: new Date(),
        tokenVersion: sql`${users.tokenVersion} + 1`,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(users.id, id), inArray(users.status, ['invited', 'active'])),
      )
      .returning();
    return updated;
  }

  /** Not `updatedAt`: signing in changes nothing about the account. */
  async recordSignIn(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastSignInAt: new Date() })
      .where(eq(users.id, id));
  }

  /** The holder proved this number (FR-AUTH-12). Written together: a trigger
   * unconfirms any write that changes the number alone. */
  async confirmPhone(id: string, phone: string): Promise<UserRow> {
    const [updated] = await this.db
      .update(users)
      .set({ phone, phoneConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  /**
   * The hash and a `tokenVersion` bump in one statement, so every older
   * session ends with the change. Answers the row, so the caller can reissue
   * its own session at the new version.
   */
  async setPassword(id: string, passwordHash: string): Promise<UserRow> {
    const [updated] = await this.db
      .update(users)
      .set({
        passwordHash,
        passwordSetAt: new Date(),
        tokenVersion: sql`${users.tokenVersion} + 1`,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  /**
   * A write that may take an admin away (deletion, deactivation, demotion),
   * refused where it would leave no admin who can sign in; an invited one
   * counts. Every admin row is locked, not only the counted ones: two admins
   * removing each other read disjoint sets, so they need a row to contend
   * for. The role is read here, so a demotion in between cannot slip past.
   */
  async removingAdmin<T>(
    removedId: string,
    write: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const admins = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.role, 'admin'),
            inArray(users.status, ['active', 'invited']),
          ),
        )
        .for('update');
      const isAdmin = admins.some((admin) => admin.id === removedId);
      const another = admins.some((admin) => admin.id !== removedId);
      if (isAdmin && !another) throw new LastAdminError();
      return write(tx);
    });
  }

  /**
   * Deletion as anonymization (FR-AUTH-06): the row stays as the target of
   * every reference to who did what, and everything identifying goes. The
   * address is replaced, which frees it for a new registration. One
   * transaction with the other areas' erasure steps: half an erasure is worse
   * than none. `by` is the admin acting on the person's request (FR-ADM-23);
   * without it, the holder did it themselves.
   */
  async anonymize(
    id: string,
    unusableHash: string,
    deletion: {
      readonly reason: AccountDeletionReason;
      readonly by?: { readonly id: string; readonly email: string };
    },
  ): Promise<UserRow> {
    const { reason, by } = deletion;
    return this.removingAdmin(id, async (tx) => {
      // Orders keep their own copy of where they went. The row is never
      // deleted, so the cascade never fires: this is the deletion.
      await tx.delete(addresses).where(eq(addresses.userId, id));
      // A code the account was waiting on carries the number it went to.
      await tx.delete(signInCodes).where(eq(signInCodes.userId, id));
      // The consent record stays, for the retention period.
      await withdrawAccountConsents(tx, id, 'account-deleted', by);
      await this.erasure.erase(tx, {
        userId: id,
        kind: 'account',
        reason,
        by: by ?? { id },
      });
      return this.anonymizeUser(tx, id, unusableHash);
    });
  }

  private async anonymizeUser(
    tx: Pick<Database, 'update'>,
    id: string,
    unusableHash: string,
  ): Promise<UserRow> {
    const [updated] = await tx
      .update(users)
      .set({
        status: 'anonymized',
        // Undeliverable (RFC 2606) but well-formed: the staff list's schema
        // still reads it.
        email: sql`concat('deleted-', ${users.id}::text, '@deleted.invalid')`,
        firstName: null,
        lastName: null,
        phone: null,
        customerType: null,
        companyName: null,
        companyRegistrationId: null,
        // It says what this customer was charged.
        tierId: null,
        passwordHash: unusableHash,
        passwordSetAt: null,
        lastSignInAt: null,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  /**
   * The holder's own name and number. The columns are named, never spread
   * from the request, so a self-service form cannot write a role or a tier.
   * Only while `active`, so a session open across a deactivation cannot.
   */
  async updateOwnProfile(
    id: string,
    profile: { firstName: string; lastName: string; phone: string | null },
  ): Promise<UserRow | undefined> {
    const [updated] = await this.db
      .update(users)
      .set({
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, id), eq(users.status, 'active')))
      .returning();
    return updated;
  }
}
