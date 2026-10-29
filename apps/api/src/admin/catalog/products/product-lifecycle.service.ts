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
import { resolvedPriceMinor } from '../../../core/catalog/product-price';

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

  /**
   * Whether the exchange currently holds the pen (FR-ADM-10). A cached
   * synchronous read, so asking it on every write costs nothing.
   */
  private get catalogIsOwned(): boolean {
    return this.settings.isExternallyOwned('catalog');
  }

  /**
   * Soft delete: sets `deletedAt`, reversible via restore. Genuinely
   * idempotent — re-deleting an already-deleted product is a no-op that leaves
   * its original `deletedAt`/`updatedAt` untouched (coalesce keeps the first
   * timestamp; `updatedAt` only moves on the live→deleted transition).
   *
   * Only an unpublished product: removal goes in steps, and taking it off sale
   * is the first (FR-ADM-01). Open while the catalog is externally owned —
   * whether a product is shown is the shop's, and the actor it records is what
   * keeps the next run from restoring it (FR-ADM-10).
   */
  async deleteProduct(slug: string, actorId: string): Promise<AdminProduct> {
    const now = new Date();
    const rows = await this.db
      .update(products)
      .set({
        deletedAt: sql`coalesce(${products.deletedAt}, ${now})`,
        updatedAt: sql`case when ${products.deletedAt} is null then ${now} else ${products.updatedAt} end`,
        // Attributed on the live->deleted transition only, so a repeat delete
        // does not rewrite who actually removed it.
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
    // Soft delete leaves the tier prices alone — they belong to the product,
    // and hiding it is reversible.
    return this.records.assemble(rows[0]);
  }

  /**
   * While the catalog is externally owned, only what a person deleted: a
   * product a run deleted is gone from the source, and the run that finds it
   * there again is what brings it back (FR-ADM-10).
   */
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
   * Delete a product permanently (FR-ADM-21): the last of the removal steps,
   * so only a product already deleted. Its prices, attributes, pairings and
   * document links go with it by cascade; its picture files are left to the
   * unreferenced-upload sweep, which removes them once nothing points at them.
   *
   * Refused for a product on an order — the order line's foreign key is
   * `restrict`, and is the backstop for one placed while this runs — and,
   * while the catalog is externally owned, for one an admin deleted: the
   * source still sends it, and the next run would create it again as new.
   * What it frees is its slug and its source key.
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
   * Put a product on the storefront, or take it off (FR-ADM-06).
   *
   * Independent of soft deletion in storage — restoring leaves publication as
   * it was — but a deleted product is restored before it is published, the
   * removal steps taken back in order (FR-ADM-01). `publishedBy`
   * records who accepted the price going public, and is cleared on the way back
   * so it never names somebody for a decision that has been undone.
   *
   * Publishing needs a price in the default list: the storefront shows every
   * visitor that list's figure, and there is nothing to show without it. A
   * refusal rather than a control the screen hides — the rule is the server's,
   * and a page that merely greyed the button would leave a machine client
   * publishing unpriced products.
   */
  async setProductPublished(
    slug: string,
    published: boolean,
    actorId: string,
  ): Promise<AdminProduct> {
    if (published) {
      await this.assertPriced(slug);
      await this.assertNotDeleted(slug);
    }
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

  /**
   * The live products whose only counterpart on sale is this one — what
   * unpublishing it would leave on sale with its pairing switched off, since a
   * pairing counts only counterparts a customer could add (FR-SET-04). A
   * product that is not on sale counts for nobody, so it strands nobody.
   */
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

  /** Refuses publishing a deleted product: it is restored first (FR-ADM-01). */
  private async assertNotDeleted(slug: string): Promise<void> {
    const row = await this.records.productBySlug(slug);
    if (row?.deletedAt) {
      throw new ConflictException({
        code: 'product-deleted',
        message: 'A deleted product is restored before it is published',
      });
    }
  }

  /** Refuses a product the default list does not price (FR-ADM-06). */
  private async assertPriced(slug: string): Promise<void> {
    const [row] = await this.db
      .select({ priceMinor: resolvedPriceMinor(null) })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    if (row && row.priceMinor === null) {
      throw new ConflictException({
        code: 'product-has-no-price',
        message: `${slug} has no price in the default list`,
      });
    }
  }
}

const productOrdered = () =>
  new ConflictException({
    code: 'product-ordered',
    message: 'A product somebody ordered is never deleted permanently',
  });

/** Drizzle wraps the driver's error, so the Postgres code is on `cause`. */
function isForeignKeyViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return cause?.code === '23503';
}
