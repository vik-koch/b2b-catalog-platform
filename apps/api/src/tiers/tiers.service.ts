import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  ne,
  not,
  sql,
} from 'drizzle-orm';
import {
  CustomerTier,
  OWNED_TIER_FIELDS,
  ReorderTiersRequest,
  TierInput,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { customerTiers, productPrices, products, users } from '../db/schema';
import { SettingsService } from '../settings/settings.service';
import { catalogExternallyOwned } from '../settings/ownership.refusals';

/**
 * Only customers are counted against a price list. Staff carry a null `tierId`
 * too, so an unfiltered "on the base list" figure would quietly include every
 * admin and manager — and since registration exists, every pending request and
 * every anonymized ex-account as well. None of those is somebody being sold to
 * at that list's prices, which is what the number is meant to answer.
 *
 * The delete guard counts differently on purpose — see `countsFor`.
 */
const isCustomer = and(eq(users.role, 'user'), eq(users.status, 'active'));

/** The one 404 this surface has; a function so each throw gets its own stack. */
const notFound = () =>
  new NotFoundException({ code: 'tier-not-found', message: 'Tier not found' });

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
    private readonly settings: SettingsService,
  ) {}

  /**
   * Tiers with their reference counts, in the display order staff chose
   * (`sortOrder`, label as the tiebreak so a fresh deployment still reads
   * sensibly). Correlated subqueries rather than grouped joins: two independent
   * one-to-many counts in one query would otherwise multiply each other.
   *
   * The badged list is a row like any other here. Its `userCount` is the one
   * figure that is not a plain join: an account on the default list is a *null*
   * `tierId`, because guests have no account at all and pointing customers at
   * the badged row as well would give one state two spellings.
   */
  async listTiers(): Promise<{ tiers: CustomerTier[]; productCount: number }> {
    const [rows, defaultUserCount, productCount] = await Promise.all([
      this.db
        .select({
          id: customerTiers.id,
          key: customerTiers.key,
          label: customerTiers.label,
          sortOrder: customerTiers.sortOrder,
          isDefault: customerTiers.isDefault,
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
          // What badging this list would cost: the products on the storefront
          // it does not price, which would come off it. Zero for the list that
          // already carries the badge — nothing there is left to move.
          wouldUnpublish: this.db.$count(
            products,
            and(
              isNotNull(products.publishedAt),
              isNull(products.deletedAt),
              not(
                exists(
                  this.db
                    .select({ one: sql`1` })
                    .from(productPrices)
                    .where(
                      and(
                        eq(productPrices.productId, products.id),
                        eq(productPrices.tierId, customerTiers.id),
                      ),
                    ),
                ),
              ),
            ),
          ),
        })
        .from(customerTiers)
        .orderBy(asc(customerTiers.sortOrder), asc(customerTiers.label)),
      this.db.$count(users, and(isNull(users.tierId), isCustomer)),
      this.db.$count(products, isNull(products.deletedAt)),
    ]);

    return {
      tiers: rows.map((r) => ({
        ...r,
        userCount: r.isDefault ? defaultUserCount : r.userCount,
        updatedAt: r.updatedAt.toISOString(),
      })),
      productCount,
    };
  }

  /** A new tier goes last: it is the one nobody has placed yet. */
  async createTier(input: TierInput, actorId: string): Promise<CustomerTier> {
    await this.assertKeyFree(input.key);

    const [{ value: maxOrder }] = await this.db
      .select({
        value:
          sql<number>`coalesce(max(${customerTiers.sortOrder}), -1)`.mapWith(
            Number,
          ),
      })
      .from(customerTiers);

    const [created] = await this.db
      .insert(customerTiers)
      .values({
        key: input.key,
        label: input.label,
        sortOrder: maxOrder + 1,
        updatedBy: actorId,
      })
      .returning();

    return this.toTier(created, 0, 0);
  }

  /**
   * Renaming is free; changing the `key` is not, because the key is what a
   * catalog sync file addresses the list by — the next sync run has to use the
   * new one. That is the admin's call to make while the shop is in charge of
   * its own prices, so it is allowed then, and refused while an external system
   * owns the catalog (FR-ADM-10): there the key is that system's handle on this
   * list, and retyping it points it at a list nobody has.
   *
   * Only the key. The label is what staff read and no exchange writes it, so
   * renaming stays open throughout — as do adding a list and dropping an unused
   * one, which is how an admin answers a run that priced a key this deployment
   * does not have.
   */
  async updateTier(
    id: string,
    input: TierInput,
    actorId: string,
  ): Promise<CustomerTier> {
    const existing = await this.tierById(id);
    if (!existing) throw notFound();

    if (input.key !== existing.key) {
      if (this.settings.isExternallyOwned('catalog')) {
        throw catalogExternallyOwned(OWNED_TIER_FIELDS.join(', '));
      }
      await this.assertKeyFree(input.key, id);
    }

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
   * clearing those prices is a deliberate admin step: cascading would silently
   * move customers onto the default list and re-price products.
   *
   * The badged list is refused outright, before the counts: every read path
   * resolves a price through it, so it is moved rather than removed. Badge
   * another list first and this one becomes an ordinary tier — which will then
   * hold every product's price, and be refused for that instead.
   */
  async deleteTier(id: string): Promise<{ message: string }> {
    const existing = await this.tierById(id);
    if (!existing) throw notFound();

    if (existing.isDefault) {
      throw new ConflictException({
        code: 'tier-is-default',
        message: 'The default price list cannot be deleted',
      });
    }

    const { userCount, priceCount } = await this.countsFor(id);
    if (userCount > 0) {
      throw new ConflictException({
        code: 'tier-has-accounts',
        message: `Tier still has ${userCount} account(s)`,
      });
    }
    if (priceCount > 0) {
      throw new ConflictException({
        code: 'tier-has-prices',
        message: `Tier still has ${priceCount} product price(s)`,
      });
    }

    await this.db.delete(customerTiers).where(eq(customerTiers.id, id));
    return { message: 'Tier deleted' };
  }

  /**
   * Moves the default badge onto one list (FR-AUTH-05).
   *
   * The badge is not the exchange's to set even while an external system owns
   * the catalog: that system writes prices, and which of its lists the shop
   * shows the public is the shop's own commercial decision — the same reason
   * a tier's label and order stay open while its key is frozen.
   *
   * Products the newly badged list does not price come off the storefront in
   * the same transaction. Leaving them published would leave pages quoting a
   * price that no longer exists; refusing the move instead would make the
   * badge unmovable for as long as one product is unpriced. The screen states
   * the figure before the move, so this is the outcome the admin chose.
   */
  async setDefaultTier(
    id: string,
    actorId: string,
  ): Promise<{ tiers: CustomerTier[]; unpublished: number }> {
    const target = await this.tierById(id);
    if (!target) throw notFound();
    if (target.isDefault)
      return { ...(await this.listTiers()), unpublished: 0 };

    const unpublished = await this.db.transaction(async (tx) => {
      // Cleared first: the partial unique index admits one badged row, so the
      // old badge has to be gone before the new one is written.
      await tx
        .update(customerTiers)
        .set({ isDefault: false, updatedAt: new Date(), updatedBy: actorId })
        .where(eq(customerTiers.isDefault, true));
      await tx
        .update(customerTiers)
        .set({ isDefault: true, updatedAt: new Date(), updatedBy: actorId })
        .where(eq(customerTiers.id, id));

      const stranded = await tx
        .update(products)
        .set({ publishedAt: null, publishedBy: null, updatedAt: new Date() })
        .where(
          and(
            isNotNull(products.publishedAt),
            isNull(products.deletedAt),
            not(
              exists(
                tx
                  .select({ one: sql`1` })
                  .from(productPrices)
                  .where(
                    and(
                      eq(productPrices.productId, products.id),
                      eq(productPrices.tierId, id),
                    ),
                  ),
              ),
            ),
          ),
        )
        .returning({ id: products.id });
      return stranded.length;
    });

    return { ...(await this.listTiers()), unpublished };
  }

  /**
   * Applies a whole ordering in one transaction.
   * Display only — no price resolves through this number.
   */
  async reorderTiers(
    request: ReorderTiersRequest,
    actorId: string,
  ): Promise<{ tiers: CustomerTier[]; productCount: number }> {
    const ids = request.order.map((entry) => entry.id);
    if (ids.length > 0) {
      const rows = await this.db
        .select({ id: customerTiers.id })
        .from(customerTiers)
        .where(inArray(customerTiers.id, ids));
      if (rows.length !== new Set(ids).size) {
        throw notFound();
      }
    }

    await this.db.transaction(async (tx) => {
      for (const entry of request.order) {
        await tx
          .update(customerTiers)
          .set({ sortOrder: entry.sortOrder, updatedBy: actorId })
          .where(eq(customerTiers.id, entry.id));
      }
    });

    return this.listTiers();
  }

  /** The tier row behind a session's `tierId`, or undefined. */
  async tierById(id: string) {
    const rows = await this.db
      .select()
      .from(customerTiers)
      .where(eq(customerTiers.id, id));
    return rows[0];
  }

  /**
   * Keys are unique case-insensitively, and the comparison is done here rather
   * than by a `lower(key)` index: Postgres folds case by collation and a
   * JavaScript engine folds it by the Unicode default, and the two disagree on
   * letters this rule now admits. One implementation, over a table of a
   * handful of rows, is cheaper than two that can differ.
   */
  private async assertKeyFree(key: string, exceptId?: string): Promise<void> {
    const folded = fold(key);
    const rows = (
      await this.db
        .select({ id: customerTiers.id, key: customerTiers.key })
        .from(customerTiers)
        .where(exceptId ? ne(customerTiers.id, exceptId) : undefined)
    ).filter((row) => fold(row.key) === folded);
    if (rows.length > 0) {
      throw new ConflictException({
        code: 'tier-key-taken',
        message: `Tier key '${key}' is already in use`,
      });
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
    wouldUnpublish = 0,
  ): CustomerTier {
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      sortOrder: row.sortOrder,
      isDefault: row.isDefault,
      userCount,
      priceCount,
      wouldUnpublish,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** One spelling of a key, for comparison only — never for storage or display. */
function fold(key: string): string {
  return key.normalize('NFC').toLowerCase();
}
