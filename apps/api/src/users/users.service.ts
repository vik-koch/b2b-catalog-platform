import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { CustomerType } from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { addresses, orderItems, orders, users } from '../db/schema';

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
   * Whether any *other* admin account exists that could still sign in. The rule
   * behind every "not the last admin" refusal — role changes, deactivation and
   * self-deletion alike — so it lives here rather than with any one of them.
   *
   * An anonymized admin does not count: the row is a tombstone, and nobody can
   * sign in as it to let anyone back in.
   */
  async hasAnotherAdmin(excludingId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, 'admin'),
          ne(users.id, excludingId),
          ne(users.status, 'anonymized'),
        ),
      );
    return Boolean(row);
  }

  /**
   * Self-deletion (FR-AUTH-06): the row stays, everything identifying about it
   * goes. It is kept because `users.id` is an FK target — the audit trail's
   * actor, the `updatedBy` columns, and the orders this deliberately does not
   * delete — so removing it would erase who did what, not just who they were.
   *
   * The address is replaced rather than kept, which **frees it**: the person
   * can register again later, as a genuinely new account with nothing linking
   * it to this one. The tombstone keeps the unique slot instead.
   *
   * The credential goes the way deactivation retires it (unusable hash, bumped
   * `tokenVersion`), so every session issued before this stops working — the
   * caller's own included, which is why the controller clears the cookie too.
   *
   * One transaction, because the saved addresses go with the account: an
   * account that is half-anonymized is worse than one that is not.
   */
  async anonymize(id: string, unusableHash: string): Promise<UserRow> {
    return this.db.transaction(async (tx) => {
      // The address book is personal data with no second purpose: orders keep
      // their own snapshot of where they went, so nothing readable is lost by
      // removing the saved rows. The account row is never deleted, so the
      // cascade on the foreign key never fires — this is the deletion.
      await tx.delete(addresses).where(eq(addresses.userId, id));
      await this.scrubOrders(tx, id);
      return this.anonymizeUser(tx, id, unusableHash);
    });
  }

  /**
   * What the copy already promises: "past orders are kept for our bookkeeping,
   * with your details removed from them". The orders stay — the line prices are
   * what bookkeeping needs — and every free-text column that could name the
   * customer goes.
   *
   * The address columns are overwritten rather than nulled: several are
   * `not null`, and the fulfilment check constraint requires a delivery order
   * to keep a destination. A scrubbed order still reads as an order.
   */
  private async scrubOrders(
    tx: Pick<NodePgDatabase<typeof schema>, 'update' | 'select'>,
    userId: string,
  ): Promise<void> {
    const scrubbed = '[removed]';
    const mine = tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.userId, userId));

    // Customer-typed, and perfectly capable of naming someone: "deliver to
    // Anna, 0170…".
    await tx
      .update(orderItems)
      .set({ note: null })
      .where(inArray(orderItems.orderId, mine));

    await tx
      .update(orders)
      .set({
        contactName: scrubbed,
        contactEmail: scrubbed,
        contactPhone: scrubbed,
        // The invoiced party is personal data too: it is the account holder or
        // somebody they named, and neither survives the account.
        partyName: scrubbed,
        partyRegistrationId: null,
        billingStreet: scrubbed,
        billingStreet2: null,
        billingPostalCode: scrubbed,
        billingCity: scrubbed,
        billingRegion: null,
        // Kept non-null where it was set, so the fulfilment constraint holds.
        deliveryStreet: sql`case when ${orders.deliveryStreet} is null then null else ${scrubbed} end`,
        deliveryStreet2: null,
        deliveryPostalCode: sql`case when ${orders.deliveryPostalCode} is null then null else ${scrubbed} end`,
        deliveryCity: sql`case when ${orders.deliveryCity} is null then null else ${scrubbed} end`,
        deliveryRegion: null,
        preferredTiming: null,
        customerNote: null,
        // Which list this customer was charged from — the same argument that
        // nulls `users.tierId`.
        tierKey: null,
      })
      .where(eq(orders.userId, userId));
  }

  private async anonymizeUser(
    tx: Pick<NodePgDatabase<typeof schema>, 'update'>,
    id: string,
    unusableHash: string,
  ): Promise<UserRow> {
    const [updated] = await tx
      .update(users)
      .set({
        status: 'anonymized',
        // `.invalid` is reserved and undeliverable (RFC 2606), and the dotted
        // form is a *syntactically* valid address — which it has to be, because
        // the tombstone still goes out over `staffUserSchema` to the staff list.
        email: sql`concat('deleted-', ${users.id}::text, '@deleted.invalid')`,
        firstName: null,
        lastName: null,
        phone: null,
        customerType: null,
        companyName: null,
        companyRegistrationId: null,
        // The pricing group is personal data of a kind: it says what this
        // customer was charged.
        tierId: null,
        passwordHash: unusableHash,
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
