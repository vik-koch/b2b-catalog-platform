import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, count, desc, sql } from 'drizzle-orm';
import {
  AttributeSelection,
  ProductListItem,
  SearchSort,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  CATALOG_PAGE_SIZE,
  Facet,
  SEARCH_CATEGORY_LIMIT,
  SEARCH_SUGGESTION_LIMIT,
  SearchCategory,
} from '@b2b-catalog-platform/shared/storefront/catalog';
import {
  KeyboardLayout,
  Pagination,
} from '@b2b-catalog-platform/shared/platform';
import { ALTERNATE_LAYOUT } from '../../config/deployment-config';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import { categories, products } from '../../db/schema';
import {
  categoryNameCondition,
  categoryNameScore,
  parseSearchQuery,
  relevanceScore,
  searchCondition,
  setSearchThreshold,
} from '../../core/catalog/product-search';
import { livePriceMinor } from '../../core/catalog/product-price';
import {
  listItemColumns,
  publiclyVisible,
  toListItem,
} from '../../core/catalog/product-view';
import { CatalogReader } from '../../core/catalog/catalog-reader';
import { paginationOf } from '../../platform/pagination';
import { productOrderBy } from './listing-sort';
import {
  buildFacets,
  resolveSelections,
  selectionConditions,
} from './product-facets';
import { stockedCategories } from './stocked-categories';
import { SearchLogger } from './search.logger';

/**
 * Product search by name and its type-ahead (FR-SEARCH-01…08). Each read runs
 * in a transaction only because the trigram threshold is set with `SET LOCAL`,
 * so everything that has to see the same matches runs inside it.
 */
@Injectable()
export class CatalogSearchService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private readonly reader: CatalogReader,
    private readonly searchLog: SearchLogger,
    @Inject(ALTERNATE_LAYOUT)
    private readonly alternateLayout: KeyboardLayout | null,
  ) {}

  /**
   * A page of matches. `sort` only reorders them (FR-SEARCH-04): which rows
   * match is the matcher's business. A query too short to run returns an empty
   * page without touching the database, and is not logged as a search
   * (NFR-OPS-05).
   */
  async searchProducts(
    rawQuery: string,
    page: number,
    sort: SearchSort,
    tierId: string | null = null,
    attributes: AttributeSelection[] = [],
  ): Promise<{
    items: ProductListItem[];
    pagination: Pagination;
    facets: Facet[];
  }> {
    const price = livePriceMinor(tierId);
    const pageSize = CATALOG_PAGE_SIZE;
    const query = parseSearchQuery(rawQuery, this.alternateLayout);
    if (!query) {
      return {
        items: [],
        pagination: paginationOf(page, pageSize, 0),
        facets: [],
      };
    }

    const scope = and(publiclyVisible, searchCondition(query));
    const definitions = await this.reader.attributeDefinitions();
    const startedAt = Date.now();

    return this.db.transaction(async (tx) => {
      await tx.execute(setSearchThreshold);
      const selections = resolveSelections(attributes, definitions);
      const where = and(scope, ...selectionConditions(tx, selections));

      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(products)
        .where(where);
      const rows = await tx
        .select(listItemColumns(price))
        .from(products)
        .where(where)
        .orderBy(...productOrderBy(sort, relevanceScore(query), price))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const facets = await buildFacets(tx, scope, definitions, selections);

      this.searchLog.record({
        query: query.normalized,
        terms: query.terms.length,
        results: Number(total),
        page,
        durationMs: Date.now() - startedAt,
      });

      return {
        items: rows.map(toListItem),
        pagination: paginationOf(page, pageSize, Number(total)),
        facets,
      };
    });
  }

  /**
   * Type-ahead (FR-SEARCH-05/06): the same matches, order and tiles as
   * `searchProducts`, so the list is a truthful prefix of the result page,
   * without the count and facets that would cost too much per keystroke.
   * Beside them, the categories whose names the query matched (FR-SEARCH-07).
   */
  async getSearchSuggestions(
    rawQuery: string,
    tierId: string | null = null,
  ): Promise<{ items: ProductListItem[]; categories: SearchCategory[] }> {
    const query = parseSearchQuery(rawQuery, this.alternateLayout);
    if (!query) return { items: [], categories: [] };
    const price = livePriceMinor(tierId);

    return this.db.transaction(async (tx) => {
      await tx.execute(setSearchThreshold);

      const rows = await tx
        .select(listItemColumns(price))
        .from(products)
        .where(and(publiclyVisible, searchCondition(query)))
        .orderBy(...productOrderBy('relevance', relevanceScore(query), price))
        .limit(SEARCH_SUGGESTION_LIMIT);

      const categoryName = sql`concat_ws(' ', ${categories.name}, ${categories.shortName})`;
      const matched = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(categoryNameCondition(query, categoryName))
        .orderBy(
          desc(categoryNameScore(query, categoryName)),
          asc(categories.name),
          asc(categories.id),
        );

      return {
        items: rows.map(toListItem),
        categories: await this.shownCategories(matched.map((row) => row.id)),
      };
    });
  }

  /**
   * The first few of `ids` the storefront links to, each with its parent's
   * name. A category the overview leaves out must not be a door into it.
   */
  private async shownCategories(ids: string[]): Promise<SearchCategory[]> {
    if (!ids.length) return [];
    const rows = await this.reader.categoryRows();
    const stocked = await stockedCategories(this.db, rows);
    const byId = new Map(rows.map((row) => [row.id, row]));

    return ids
      .filter((id) => stocked.has(id))
      .slice(0, SEARCH_CATEGORY_LIMIT)
      .flatMap((id) => {
        const row = byId.get(id);
        if (!row) return [];
        const parent = row.parentId ? byId.get(row.parentId) : undefined;
        return [
          {
            slug: row.slug,
            name: row.name,
            shortName: row.shortName,
            mark: row.mark,
            parent: parent?.name ?? null,
          },
        ];
      });
  }
}
