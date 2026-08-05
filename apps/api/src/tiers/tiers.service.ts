import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { CustomerTier, TierInput } from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { customerTiers, productPrices, users } from '../db/schema';

/**
 * Only customers are counted against a price list. Staff carry a null `tierId`
 * too, so an unfiltered "on the base list" figure would quietly include every
 * admin and manager.
 */
const isCustomer = eq(users.role, 'user');

/**
 * The additional customer tiers. The base list is a column on `products`,
 * not a row here, so this service never sees it — it manages only
 * the deployment's extra price lists.
 *
 * Both foreign keys into `customer_tiers` restrict, so the database is the
 * real delete guard; the counts this service reports exist so an admin sees
 * *why* a tier is undeletable rather than a foreign-key error.
 */
@Injectable()
export class TiersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Tiers with their reference counts, ordered by label — the order staff
   * scan by. Correlated subqueries rather than grouped joins: two independent
   * one-to-many counts in one query would otherwise multiply each other.
   *
   * `defaultUserCount` accompanies them because the admin list draws the base
   * list as a synthetic entry, and that entry's account count is the one thing
   * it cannot derive: "on the base list" is a null `tierId`, not a row.
   */
  async listTiers(): Promise<{
    tiers: CustomerTier[];
    defaultUserCount: number;
  }> {
    const [rows, defaultUserCount] = await Promise.all([
      this.db
        .select({
          id: customerTiers.id,
          key: customerTiers.key,
          label: customerTiers.label,
          updatedAt: customerTiers.updatedAt,
          // `$count` rather than a hand-written subquery: inside an `sql`
          // template drizzle emits column names unqualified, so the outer
          // `customer_tiers.id` would silently bind to `users.id` instead.
          userCount: this.db.$count(
            users,
            and(eq(users.tierId, customerTiers.id), isCustomer),
          ),
          priceCount: this.db.$count(
            productPrices,
            eq(productPrices.tierId, customerTiers.id),
          ),
        })
        .from(customerTiers)
        .orderBy(asc(customerTiers.label)),
      this.db.$count(users, and(isNull(users.tierId), isCustomer)),
    ]);

    return {
      tiers: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
      defaultUserCount,
    };
  }

  async createTier(input: TierInput, actorId: string): Promise<CustomerTier> {
    await this.assertKeyFree(input.key);

    const [created] = await this.db
      .insert(customerTiers)
      .values({ key: input.key, label: input.label, updatedBy: actorId })
      .returning();

    return this.toTier(created, 0, 0);
  }

  /**
   * Renaming is free; changing the `key` is not, because the key is what an
   * import file addresses the list by — the next sync run has to use the new
   * one. That is the admin's call to make, so it is allowed, not blocked.
   */
  async updateTier(
    id: string,
    input: TierInput,
    actorId: string,
  ): Promise<CustomerTier> {
    const existing = await this.tierById(id);
    if (!existing) throw new NotFoundException('Tier not found');

    if (input.key !== existing.key) await this.assertKeyFree(input.key, id);

    const [updated] = await this.db
      .update(customerTiers)
      .set({
        key: input.key,
        label: input.label,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(customerTiers.id, id))
      .returning();

    const counts = await this.countsFor(id);
    return this.toTier(updated, counts.userCount, counts.priceCount);
  }

  /**
   * Refused while anything references the tier. Re-tiering those accounts and
   * clearing those overrides is a deliberate admin step: cascading would
   * silently move customers onto the base list and re-price products.
   */
  async deleteTier(id: string): Promise<{ message: string }> {
    const existing = await this.tierById(id);
    if (!existing) throw new NotFoundException('Tier not found');

    const { userCount, priceCount } = await this.countsFor(id);
    if (userCount > 0) {
      throw new ConflictException(
        `Tier still has ${userCount} account(s); move them to another tier first`,
      );
    }
    if (priceCount > 0) {
      throw new ConflictException(
        `Tier still has ${priceCount} product price(s); clear them first`,
      );
    }

    await this.db.delete(customerTiers).where(eq(customerTiers.id, id));
    return { message: 'Tier deleted' };
  }

  /** The tier row behind a session's `tierId`, or undefined. */
  async tierById(id: string) {
    const rows = await this.db
      .select()
      .from(customerTiers)
      .where(eq(customerTiers.id, id));
    return rows[0];
  }

  private async assertKeyFree(key: string, exceptId?: string): Promise<void> {
    const rows = await this.db
      .select({ id: customerTiers.id })
      .from(customerTiers)
      .where(
        exceptId
          ? and(eq(customerTiers.key, key), ne(customerTiers.id, exceptId))
          : eq(customerTiers.key, key),
      );
    if (rows.length > 0) {
      throw new ConflictException(`Tier key '${key}' is already in use`);
    }
  }

  /**
   * Deliberately unfiltered by role, unlike the list: this guards a restricting
   * foreign key, and the key does not care what role the referencing account
   * has. Filtering here could report zero and then fail the delete with a
   * constraint error.
   */
  private async countsFor(
    id: string,
  ): Promise<{ userCount: number; priceCount: number }> {
    const [userCount, priceCount] = await Promise.all([
      this.db.$count(users, eq(users.tierId, id)),
      this.db.$count(productPrices, eq(productPrices.tierId, id)),
    ]);
    return { userCount, priceCount };
  }

  private toTier(
    row: typeof customerTiers.$inferSelect,
    userCount: number,
    priceCount: number,
  ): CustomerTier {
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      userCount,
      priceCount,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
