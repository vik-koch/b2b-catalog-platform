import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { AdminProduct } from '@b2b-catalog-platform/shared/admin/catalog';
import { DRIZZLE } from '../../../db/database.module';
import * as schema from '../../../db/schema';
import { orderItems, productPairings, products } from '../../../db/schema';
import { SettingsService } from '../../../settings/settings.service';
import { catalogExternallyOwned } from '../../../settings/ownership.refusals';
import {
  counterpartOf,
  involves,
  pairedCountOf,
} from '../../../core/catalog/product-pairings';
import { isForeignKeyViolation } from '../../../db/pg-errors';
import {
  ProductRecords,
  productNotFound,
  adminProductColumns,
} from './product-records';

/**
 * The removal steps and publication (FR-ADM-01/06/21): unpublish, delete,
 * delete permanently, and the way back. Each answers with the product as it
 * now stands.
 */
@Injectable()
export class ProductLifecycleService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private readonly settings: SettingsService,
    private readonly records: ProductRecords,
  ) {}

  /** Whether the exchange owns the catalog (FR-ADM-10); a cached read. */
  private get catalogIsOwned(): boolean {
    return this.settings.isExternallyOwned('catalog');
  }

  /**
   * Soft delete, idempotent: a repeat keeps the first timestamps and actor.
   * Only an unpublished product, since removal unpublishes first (FR-ADM-01).
   * Open while the catalog is owned: the actor it records keeps the next run
   * from restoring it (FR-ADM-10).
   */
  async deleteProduct(slug: string, actorId: string): Promise<AdminProduct> {
    const now = new Date();
    const rows = await this.db
      .update(products)
      .set({
        deletedAt: sql`coalesce(${products.deletedAt}, ${now})`,
        updatedAt: sql`case when ${products.deletedAt} is null then ${now} else ${products.updatedAt} end`,
        deletedBy: sql`case when ${products.deletedAt} is null then ${actorId}::uuid else ${products.deletedBy} end`,
      })
      .where(
        and(
          eq(products.slug, slug),
          or(isNull(products.publishedAt), isNotNull(products.deletedAt)),
        ),
      )
      .returning(adminProductColumns);
    if (!rows[0]) {
      throw (await this.records.productBySlug(slug))
        ? new ConflictException({
            code: 'product-published',
            message:
              'A product on the storefront is unpublished before it is deleted',
          })
        : productNotFound();
    }
    return this.records.assemble(rows[0]);
  }

  /** While the catalog is owned, only what a person deleted: a run's deletion
   * is undone by the run that finds the product again (FR-ADM-10). */
  async restoreProduct(slug: string, actorId: string): Promise<AdminProduct> {
    const rows = await this.db
      .update(products)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(
        and(
          eq(products.slug, slug),
          this.catalogIsOwned
            ? or(isNull(products.deletedAt), isNotNull(products.deletedBy))
            : undefined,
        ),
      )
      .returning(adminProductColumns);
    if (!rows[0]) {
      throw (await this.records.productBySlug(slug))
        ? catalogExternallyOwned('restore')
        : productNotFound();
    }
    return this.records.assemble(rows[0]);
  }

  /**
   * Deletes a deleted product for good (FR-ADM-21); its lists go by cascade,
   * its pictures with the upload sweep. Refused for an ordered one (the order
   * line's restricting key backs that up against a race) and, while owned, for
   * one an admin deleted, which the next run would create again.
   */
  async purgeProduct(slug: string): Promise<{ slug: string; name: string }> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: products.id,
          slug: products.slug,
          name: products.name,
          deletedAt: products.deletedAt,
          deletedBy: products.deletedBy,
        })
        .from(products)
        .where(eq(products.slug, slug))
        .for('update');
      if (!row) throw productNotFound();
      if (!row.deletedAt) {
        throw new ConflictException({
          code: 'product-not-deleted',
          message: 'Only a deleted product can be deleted permanently',
        });
      }
      if (this.catalogIsOwned && row.deletedBy !== null) {
        throw catalogExternallyOwned('delete permanently');
      }
      const orderLines = await tx.$count(
        orderItems,
        eq(orderItems.productId, row.id),
      );
      if (orderLines > 0) throw productOrdered();
      try {
        await tx.delete(products).where(eq(products.id, row.id));
      } catch (error) {
        if (isForeignKeyViolation(error)) throw productOrdered();
        throw error;
      }
      return { slug: row.slug, name: row.name };
    });
  }

  /**
   * Puts a product on the storefront or takes it off (FR-ADM-06).
   * `publishedBy` names who accepted the price going public, and is cleared on
   * the way back so it never names anybody for an undone decision.
   */
  async setProductPublished(
    slug: string,
    published: boolean,
    actorId: string,
  ): Promise<AdminProduct> {
    if (published) await this.assertPublishable(slug);
    const rows = await this.db
      .update(products)
      .set({
        publishedAt: published ? new Date() : null,
        publishedBy: published ? actorId : null,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(products.slug, slug))
      .returning(adminProductColumns);
    if (!rows[0]) throw productNotFound();
    return this.records.assemble(rows[0]);
  }

  /** The live products whose only counterpart on sale is this one, which
   * unpublishing it would strand (FR-SET-04). */
  async listStrandedPairings(
    slug: string,
  ): Promise<{ slug: string; name: string }[]> {
    const [own] = await this.db
      .select({
        id: products.id,
        deletedAt: products.deletedAt,
        publishedAt: products.publishedAt,
      })
      .from(products)
      .where(eq(products.slug, slug));
    if (!own) throw productNotFound();
    if (own.deletedAt !== null || own.publishedAt === null) return [];
    return this.db
      .select({ slug: products.slug, name: products.name })
      .from(productPairings)
      .innerJoin(products, eq(products.id, counterpartOf(own.id)))
      .where(
        and(
          involves(own.id),
          isNull(products.deletedAt),
          isNotNull(products.publishedAt),
          // This product is one of them, so one means it is the only one.
          sql`${pairedCountOf()} = 1`,
        ),
      )
      .orderBy(asc(products.name));
  }

  /** Refuses an unpriced product (FR-ADM-06), then a deleted one, which is
   * restored first (FR-ADM-01). A missing one is the update's 404. */
  private async assertPublishable(slug: string): Promise<void> {
    const row = await this.records.productBySlug(slug);
    if (row && row.priceMinor === null) {
      throw new ConflictException({
        code: 'product-has-no-price',
        message: `${slug} has no price in the default list`,
      });
    }
    if (row?.deletedAt) {
      throw new ConflictException({
        code: 'product-deleted',
        message: 'A deleted product is restored before it is published',
      });
    }
  }
}

const productOrdered = () =>
  new ConflictException({
    code: 'product-ordered',
    message: 'A product somebody ordered is never deleted permanently',
  });
