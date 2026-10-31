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
import { HiddenProduct } from '@b2b-catalog-platform/shared/core/catalog';
import {
  KeyboardLayout,
  Pagination,
} from '@b2b-catalog-platform/shared/platform';
import {
  ADMIN_CATALOG_PAGE_SIZE,
  AdminProductListItem,
  AdminProductListQuery,
  AdminProductState,
  INCOMPLETE_GAPS,
  PRODUCT_FEATURES,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { DRIZZLE } from '../../../../db/database.module';
import * as schema from '../../../../db/schema';
import { categories, orderItems, products } from '../../../../db/schema';
import { attributeValuesCondition } from '../../../../core/catalog/attribute-filter';
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
} from '../../../../core/catalog/catalog-tree';
import {
  adminSearchCondition,
  parseSearchQuery,
  relevanceScore,
  setSearchThreshold,
} from '../../../../core/catalog/product-search';
import { gridOrderBy } from './grid-sort';
import {
  listItemColumns,
  publiclyVisible,
  toUnpricedListItem,
} from '../../../../core/catalog/product-view';
import { CatalogReader } from '../../../../core/catalog/catalog-reader';
import { paginationOf } from '../../../../platform/pagination';
import { resolvedPriceMinor } from '../../../../core/catalog/product-price';
import { ALTERNATE_LAYOUT } from '../../../../config/deployment-config';
import { categoryNotFound } from '../../categories/categories.service';

import { deletedByRun } from '../product-records';

/**
 * The admin's product lists: the grid (FR-ADM-05) and what a category holds
 * that the storefront does not show, for edit mode's overlay.
 */
@Injectable()
export class ProductGridService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private readonly reader: CatalogReader,
    @Inject(ALTERNATE_LAYOUT)
    private readonly alternateLayout: KeyboardLayout | null,
  ) {}

  /**
   * The admin grid (FR-ADM-05). In a transaction because the trigram threshold
   * is set with `SET LOCAL`, as in the storefront search. Not logged as a
   * search (NFR-OPS-05): that log is what customers look for.
   */
  async listProducts(query: AdminProductListQuery): Promise<{
    items: AdminProductListItem[];
    deletedMatches?: number;
    pagination: Pagination;
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
      // The stored state, not the count, so grid and badge agree.
      query.availability
        ? eq(products.availability, query.availability)
        : undefined,
      attributeValuesCondition(
        this.db,
        query.attributeKey,
        query.attributeValue ? [query.attributeValue] : [],
      ),
      tierPriceCondition(this.db, query.tierId, query.tierPriced),
      documentCondition(this.db, query.documentId),
      missingCondition(this.db, query.missing),
      featureCondition(this.db, query.has),
      adminSearchCondition(query.q, this.alternateLayout) ?? undefined,
    );
    const where = and(stateCondition(query.state), narrowing);
    // Ranked only when the name matcher can score the box; otherwise
    // `relevance` falls back to state.
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
        .orderBy(...gridOrderBy(query.sort, score))
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

  /** The categories a grid filter covers: the one asked for and everything
   * beneath it (FR-ADM-19), or with `direct` only itself. */
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

  /** The unpublished products in a category's subtree, scoped like the
   * storefront's listing, for edit mode's overlay. */
  async listHiddenProducts(slug: string): Promise<HiddenProduct[]> {
    const rows = await this.reader.categoryRows();
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
    return hidden.map(toUnpricedListItem);
  }
}

/** A publication state as a condition (FR-ADM-05). Deleted products are only
 * ever their own state: they are out of the catalog (FR-ADM-22). */
function stateCondition(state: AdminProductState): SQL | undefined {
  switch (state) {
    case 'all':
      return isNull(products.deletedAt);
    case 'live':
      return publiclyVisible;
    case 'unpublished':
      return and(isNull(products.deletedAt), isNull(products.publishedAt));
    case 'deleted':
      return isNotNull(products.deletedAt);
  }
}
