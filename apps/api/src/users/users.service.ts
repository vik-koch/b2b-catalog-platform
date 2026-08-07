import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { CustomerType } from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { users } from '../db/schema';

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
  readonly companyRegistrationId: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findById(id: string): Promise<UserRow | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    // Logins are case-insensitive: emails are stored lowercased (see bootstrap)
    // and looked up the same way, so `Admin@x` and `admin@x` are one account.
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()));
    return rows[0];
  }

  /**
   * Create a self-registered account (FR-AUTH-01): `pending`, so it cannot sign
   * in, with no tier — staff assign one when they approve it. The hash is an
   * argon2 hash of a random secret nobody holds, rather than a placeholder.
   */
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
   * Set the password behind a redeemed link, and make the account usable: an
   * `invited` one becomes `active` here, which is the whole point of the
   * invitation — approval decides *whether*, this decides *when*.
   *
   * Only an `invited` (first password) or already-`active` (reset) account is
   * touched. That upper bound is what tokens are minted for anyway — but naming
   * it here means a link can never move any *other* status into `active`: it
   * cannot activate a still-`pending` registration that skipped approval, nor
   * bring an `anonymized` tombstone back. Everything `setPassword` does applies
   * too: the tokenVersion bump invalidates other sessions, and
   * `mustChangePassword` clears because the account has now chosen its own.
   */
  async setPasswordFromToken(
    id: string,
    passwordHash: string,
  ): Promise<UserRow | undefined> {
    const [updated] = await this.db
      .update(users)
      .set({
        passwordHash,
        status: 'active',
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

  /**
   * Replace the password hash and bump `tokenVersion` in one statement, so the
   * change atomically invalidates every session issued before it. Clears
   * `mustChangePassword` in the same write: whatever was handed to the account,
   * it has now chosen its own. Returns the updated row so the caller can
   * re-issue its own session token at the new version.
   */
  async setPassword(id: string, passwordHash: string): Promise<UserRow> {
    const [updated] = await this.db
      .update(users)
      .set({
        passwordHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  /**
   * The account holder correcting their own name and phone number. Narrow by
   * construction — the columns are named here rather than spread from the
   * request — so this can never become the path by which a self-service form
   * writes a role, a tier or a status.
   *
   * Guarded on `active`: the same accounts that may sign in are the ones that
   * may edit, so a session in flight when staff deactivate the account cannot
   * still write to it.
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
