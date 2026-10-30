import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  SQL,
} from 'drizzle-orm';
import { ADMIN_CATALOG_PAGE_SIZE } from '@b2b-catalog-platform/shared/admin/catalog';
import { HiddenProduct } from '@b2b-catalog-platform/shared/core/catalog';
import { KeyboardLayout } from '@b2b-catalog-platform/shared/platform';
import {
  AdminProductListItem,
  AdminProductListQuery,
  AdminProductState,
  INCOMPLETE_GAPS,
  PRODUCT_FEATURES,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { DRIZZLE } from '../../../db/database.module';
import * as schema from '../../../db/schema';
import { categories, orderItems, products } from '../../../db/schema';
import { attributeValuesCondition } from '../../../core/catalog/attribute-filter';
import { documentCondition } from './document-filter';
import {
  featureColumns,
  featureCondition,
  incompleteGapColumns,
  missingCondition,
} from './content-filter';
import { tierPriceCondition } from './tier-price-filter';
import {
  categoryBySlug,
  descendantIds,
} from '../../../core/catalog/catalog-tree';
import {
  adminSearchCondition,
  parseSearchQuery,
  relevanceScore,
  setSearchThreshold,
} from '../../../core/catalog/product-search';
import { adminProductOrderBy } from './grid-sort';
import {
  listItemColumns,
  toUnpricedListItem,
} from '../../../core/catalog/product-view';
import { paginationOf } from '../../../platform/pagination';
import { resolvedPriceMinor } from '../../../core/catalog/product-price';
import { ALTERNATE_LAYOUT } from '../../../config/deployment-config';
import { categoryNotFound } from '../categories/admin-categories.service';

import { deletedByRun } from './product-records';

/**
 * The admin's product lists: the grid (FR-ADM-05) and what a category holds
 * that the storefront does not show, for edit mode's overlay.
 */
@Injectable()
export class ProductGridService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    @Inject(ALTERNATE_LAYOUT)
    private readonly alternateLayout: KeyboardLayout | null,
  ) {}

  /**
   * The admin grid (FR-ADM-05): filtered by publication state and category,
   * searched by name or sync key, sorted. Unlike the storefront listing this
   * shows unpublished rows by default; deleted rows only under their own state
   * (FR-ADM-22), because they are out of the catalog.
   *
   * Runs in a transaction for the same reason the storefront search does: the
   * trigram threshold is set with `SET LOCAL`, so the matcher's recall cannot
   * depend on the server default. Not logged as a search (NFR-OPS-05) — the
   * search log measures what customers look for, and an admin looking up a row
   * they are about to edit would poison that.
   */
  async listProducts(query: AdminProductListQuery): Promise<{
    items: AdminProductListItem[];
    deletedMatches?: number;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const pageSize = ADMIN_CATALOG_PAGE_SIZE;
    const search = parseSearchQuery(query.q, this.alternateLayout);
    const categoryIds = query.categoryId
      ? await this.categoryScopeIds(query.categoryId, query.categoryScope)
      : undefined;
    // Every narrowing but the state, so the archive can be counted under the
    // same search when the catalog itself has nothing.
    const narrowing = and(
      categoryIds ? inArray(products.categoryId, categoryIds) : undefined,
      // The stored state, not the count: the threshold that decides "few left"
      // follows the packaging, and a filter that re-derived it here would go
      // out of step with the badge beside it the first time a box changed size.
      query.availability
        ? eq(products.availability, query.availability)
        : undefined,
      // The inventory's drill-down: the products carrying one attribute key,
      // and optionally one of its values.
      attributeValuesCondition(
        this.db,
        query.attributeKey,
        query.attributeValue ? [query.attributeValue] : [],
      ),
      // Where the tier list's price count leads: the products this tier has a
      // price of its own for.
      tierPriceCondition(this.db, query.tierId, query.tierPriced),
      // Where the document list's product count leads: the products showing
      // one certificate, declaration or data sheet.
      documentCondition(this.db, query.documentId),
      // What the product's own content lacks or carries (FR-ADM-20).
      missingCondition(this.db, query.missing),
      featureCondition(this.db, query.has),
      adminSearchCondition(query.q, this.alternateLayout) ?? undefined,
    );
    const where = and(stateCondition(query.state), narrowing);
    // Only rank when the box holds something the name matcher could score; a
    // sync-key-only lookup has no meaningful relevance and falls back to name.
    const score = search ? relevanceScore(search) : undefined;

    return this.db.transaction(async (tx) => {
      await tx.execute(setSearchThreshold);

      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(products)
        .where(where);
      // Only a search can be looking for one product that turns out to be
      // deleted; a filter alone narrowing to nothing is an answer.
      const deletedMatches =
        Number(total) === 0 && query.q.trim() && query.state !== 'deleted'
          ? await tx.$count(products, and(stateCondition('deleted'), narrowing))
          : 0;

      const rows = await tx
        .select({
          slug: products.slug,
          name: products.name,
          priceMinor: resolvedPriceMinor(null),
          categoryId: products.categoryId,
          sourceId: products.sourceId,
          images: products.images,
          deletedAt: products.deletedAt,
          deletedBy: products.deletedBy,
          // `$count` rather than a hand-written `exists`: inside an `sql`
          // template the outer `products.id` would bind unqualified.
          orderLines: this.db.$count(
            orderItems,
            eq(orderItems.productId, products.id),
          ),
          publishedAt: products.publishedAt,
          updatedAt: products.updatedAt,
          availability: products.availability,
          stockPieces: products.stockPieces,
          gaps: incompleteGapColumns(this.db),
          features: featureColumns(this.db),
        })
        .from(products)
        .where(where)
        .orderBy(...adminProductOrderBy(query.sort, score))
        .limit(pageSize)
        .offset((query.page - 1) * pageSize);

      return {
        items: rows.map((r) => ({
          slug: r.slug,
          name: r.name,
          priceMinor: r.priceMinor,
          categoryId: r.categoryId,
          sourceId: r.sourceId,
          thumb: r.images[0]?.thumb ?? null,
          availability: r.availability,
          stockPieces: r.stockPieces,
          gaps: INCOMPLETE_GAPS.filter((gap) => r.gaps[gap]),
          features: PRODUCT_FEATURES.filter((feature) => r.features[feature]),
          deletedAt: r.deletedAt?.toISOString() ?? null,
          deletedByRun: deletedByRun(r),
          ordered: r.orderLines > 0,
          publishedAt: r.publishedAt?.toISOString() ?? null,
          updatedAt: r.updatedAt.toISOString(),
        })),
        ...(deletedMatches > 0 && { deletedMatches }),
        pagination: paginationOf(query.page, pageSize, Number(total)),
      };
    });
  }

  /**
   * The categories a grid filter covers: the one asked for and everything
   * beneath it, as the storefront listing and the category list's counts read
   * a category (FR-ADM-19) — or, narrowed to `direct`, only the one itself. An
   * unknown id stays in the list on its own and matches nothing.
   */
  private async categoryScopeIds(
    categoryId: string,
    scope: AdminProductListQuery['categoryScope'],
  ): Promise<string[]> {
    if (scope === 'direct') return [categoryId];
    const rows = await this.db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories);
    return descendantIds(categoryId, rows);
  }

  /**
   * What this category's subtree holds that the storefront does not show: its
   * unpublished products. Deleted ones are out of the catalog (FR-ADM-22), so
   * they are left to the admin product list. Aggregates over descendants
   * exactly like the storefront grid (Pattern A), so the edit-mode overlay and
   * the live grid agree on what belongs to a category.
   */
  async listHiddenProducts(slug: string): Promise<HiddenProduct[]> {
    const rows = await this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        shortName: categories.shortName,
        parentId: categories.parentId,
        mark: categories.mark,
        sortOrder: categories.sortOrder,
      })
      .from(categories);
    const category = categoryBySlug(rows, slug);
    if (!category) throw categoryNotFound();

    const ids = descendantIds(category.id, rows);
    // Default-list prices: staff have no tier.
    const hidden = await this.db
      .select(listItemColumns(resolvedPriceMinor(null)))
      .from(products)
      .where(
        and(inArray(products.categoryId, ids), stateCondition('unpublished')),
      )
      .orderBy(asc(products.name));
    return hidden.map((row) => toUnpricedListItem(row));
  }
}

/**
 * A publication state as a condition (FR-ADM-05). `all` is the catalog, live
 * and unpublished; deleted products are only ever their own state, because
 * they are out of the catalog (FR-ADM-22).
 */
function stateCondition(state: AdminProductState): SQL | undefined {
  switch (state) {
    case 'all':
      return isNull(products.deletedAt);
    // What the storefront shows: published and not deleted.
    case 'live':
      return and(isNull(products.deletedAt), isNotNull(products.publishedAt));
    case 'unpublished':
      return and(isNull(products.deletedAt), isNull(products.publishedAt));
    case 'deleted':
      return isNotNull(products.deletedAt);
  }
}
