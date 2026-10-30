import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgColumn } from 'drizzle-orm/pg-core';
import { and, asc, count, desc, eq, inArray, max, sql, SQL } from 'drizzle-orm';
import {
  AttributeSelection,
  CategoryCrumb,
  ProductDetail,
  ProductListItem,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  CATALOG_PAGE_SIZE,
  Facet,
  CategoryNode,
  CatalogSort,
  SubcategoryLink,
  SEARCH_CATEGORY_LIMIT,
  SEARCH_SUGGESTION_LIMIT,
  SearchCategory,
  FEATURED_ROW_SIZE,
  SitemapEntry,
} from '@b2b-catalog-platform/shared/storefront/catalog';
import { SearchSort } from '@b2b-catalog-platform/shared/core/catalog';
import { KeyboardLayout } from '@b2b-catalog-platform/shared/platform';
import { ALTERNATE_LAYOUT } from '../../config/deployment-config';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import {
  attributeDefinitions,
  catalogAttributes,
  categories,
  pageVersions,
  productPairings,
  products,
} from '../../db/schema';
import {
  ancestorsOf,
  categoryBySlug,
  CategoryRow,
  descendantIds,
  subtreeCounts,
} from '../../core/catalog/catalog-tree';
import {
  parseSearchQuery,
  categoryNameCondition,
  categoryNameScore,
  relevanceScore,
  searchCondition,
  setSearchThreshold,
} from '../../core/catalog/product-search';
import { livePriceMinor } from '../../core/catalog/product-price';
import { catalogOrderBy, productOrderBy } from './listing-sort';
import {
  buildCategoryTree,
  categoryTreeOrder,
  directChildren,
  stockedCategoryIds,
} from './category-tree';
import {
  publiclyVisible,
  availabilityColumns,
  partsColumns,
  pictureColumns,
  toListItem,
  noteColumns,
  unitColumns,
} from '../../core/catalog/product-view';
import {
  counterpartOf,
  involves,
  pairedCountOf,
} from '../../core/catalog/product-pairings';
import {
  featuredRowCandidate,
  featuredRowOrder,
  shuffled,
} from './featured-row';
import {
  buildFacets,
  ResolvedSelection,
  resolveSelections,
  selectionConditions,
} from './product-facets';
import { carriedSelections, selectionParams } from './subcategory-links';
import { DefinitionRow } from '../../core/catalog/category-filters';
import { SearchLogger } from './search.logger';
import { CatalogReader } from '../../core/catalog/catalog-reader';

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface SearchResult {
  items: ProductListItem[];
  pagination: Pagination;
  facets: Facet[];
}

interface CatalogProductsResult {
  categories: SubcategoryLink[];
  items: ProductListItem[];
  pagination: Pagination;
  facets: Facet[];
}

interface CategoryProductsResult {
  category: {
    slug: string;
    name: string;
    shortName: string | null;
    ancestors: CategoryCrumb[];
    subcategories: SubcategoryLink[];
  };
  items: ProductListItem[];
  pagination: Pagination;
  facets: Facet[];
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private readonly reader: CatalogReader,
    private readonly searchLog: SearchLogger,
    @Inject(ALTERNATE_LAYOUT)
    private readonly alternateLayout: KeyboardLayout | null,
  ) {}

  /**
   * Category ids a publicly visible product sits in, direct only. The input to
   * every public category listing: what is not stocked is not linked to.
   */
  private async liveCategoryIds(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ id: products.categoryId })
      .from(products)
      .where(publiclyVisible);
    return rows.map((row) => row.id);
  }

  /** The public tree (FR-CAT-01/02), pruned to what has something to show. */
  async getCategoryTree(): Promise<CategoryNode[]> {
    const rows = await this.reader.categoryRows();
    const stocked = stockedCategoryIds(rows, await this.liveCategoryIds());
    return buildCategoryTree(rows.filter((row) => stocked.has(row.id)));
  }

  /**
   * Every publicly visible product (FR-CAT-02/03) — the catalogue index as a
   * listing, one level above any category. The same page as a category's,
   * with the top-level categories as its drill-down nav and the
   * whole-catalogue panel (FR-ATTR-12) as its filters.
   */
  async getCatalogProducts(
    page: number,
    sort: CatalogSort,
    tierId: string | null = null,
    attributes: AttributeSelection[] = [],
  ): Promise<CatalogProductsResult> {
    const price = livePriceMinor(tierId);
    const rows = await this.reader.categoryRows();
    const stocked = stockedCategoryIds(rows, await this.liveCategoryIds());
    const definitions = await this.catalogDefinitions();
    const selections = resolveSelections(attributes, definitions);
    const scope = publiclyVisible;
    const where = and(scope, ...selectionConditions(this.db, selections));

    const orderBy = catalogOrderBy(sort, price, categoryTreeOrder(rows));
    const listing = await this.listingPage(where, page, price, orderBy);
    const facets = await buildFacets(this.db, scope, definitions, selections);
    const categories = await this.subcategoryLinks(
      null,
      rows,
      stocked,
      selections,
      await this.reader.categoryPanels(rows),
    );

    return { categories, ...listing, facets };
  }

  /**
   * A category's products (FR-CAT-03/04), narrowed by the attribute selection
   * the caller carries (FR-ATTR-05).
   *
   * The scope and the selection are kept apart on purpose: the facet panel is
   * built from the scope, so the values it offers do not shrink as they are
   * clicked. See product-facets.ts.
   */
  async getCategoryProducts(
    slug: string,
    page: number,
    sort: CatalogSort,
    tierId: string | null = null,
    attributes: AttributeSelection[] = [],
  ): Promise<CategoryProductsResult | null> {
    const price = livePriceMinor(tierId);
    const rows = await this.reader.categoryRows();
    const category = categoryBySlug(rows, slug);
    if (!category) return null;

    const ids = descendantIds(category.id, rows);
    const scope = and(inArray(products.categoryId, ids), publiclyVisible);
    // Scoping reads every row — a product's page must work under a category
    // nothing else is visible in — while the drill-down nav reads the pruned
    // set, so it never offers a subcategory with an empty grid behind it.
    const stocked = stockedCategoryIds(rows, await this.liveCategoryIds());
    const panelOf = await this.reader.categoryPanels(rows);
    const definitions = panelOf(category.id);
    const selections = resolveSelections(attributes, definitions);
    const where = and(scope, ...selectionConditions(this.db, selections));

    const orderBy = catalogOrderBy(sort, price, categoryTreeOrder(rows));
    const listing = await this.listingPage(where, page, price, orderBy);
    const facets = await buildFacets(this.db, scope, definitions, selections);
    const subcategories = await this.subcategoryLinks(
      category.id,
      rows,
      stocked,
      selections,
      panelOf,
    );

    return {
      category: {
        slug: category.slug,
        name: category.name,
        shortName: category.shortName,
        ancestors: ancestorsOf(category.id, rows),
        subcategories,
      },
      ...listing,
      facets,
    };
  }

  /**
   * A listing's chips (FR-CAT-02): its stocked direct children, each with the
   * part of the selection its own panel offers and what that part leaves
   * beneath it (FR-ATTR-13). One grouped count per distinct part — usually
   * one for the whole row.
   */
  private async subcategoryLinks(
    parentId: string | null,
    rows: CategoryRow[],
    stocked: Set<string>,
    selections: ResolvedSelection[],
    panelOf: (categoryId: string) => DefinitionRow[],
  ): Promise<SubcategoryLink[]> {
    const totalsBy = new Map<string, Promise<Map<string, number>>>();
    const children = directChildren(
      parentId,
      rows.filter((row) => stocked.has(row.id)),
    );
    const links: SubcategoryLink[] = [];
    for (const child of children) {
      const carried = carriedSelections(selections, panelOf(child.id));
      const attr = selectionParams(carried);
      const key = JSON.stringify(attr);
      let totals = totalsBy.get(key);
      if (!totals) {
        totals = this.subtreeTotals(carried, rows);
        totalsBy.set(key, totals);
      }
      links.push({
        slug: child.slug,
        name: child.name,
        shortName: child.shortName,
        mark: child.mark,
        count: (await totals).get(child.id) ?? 0,
        attr,
      });
    }
    return links;
  }

  /** Publicly visible products under each category, subtree included, that
   * `selections` leaves. */
  private async subtreeTotals(
    selections: ResolvedSelection[],
    rows: CategoryRow[],
  ): Promise<Map<string, number>> {
    const direct = await this.db
      .select({ id: products.categoryId, value: count() })
      .from(products)
      .where(and(publiclyVisible, ...selectionConditions(this.db, selections)))
      .groupBy(products.categoryId);
    return subtreeCounts(
      rows,
      new Map(direct.map((row) => [row.id, Number(row.value)])),
    );
  }

  /** One page of a browsed listing and the count behind it — a category's or
   * the whole catalogue's, which differ only in `where`. */
  private async listingPage(
    where: SQL | undefined,
    page: number,
    price: SQL<number>,
    orderBy: (SQL | PgColumn)[],
  ): Promise<{ items: ProductListItem[]; pagination: Pagination }> {
    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(products)
      .where(where);

    const pageSize = CATALOG_PAGE_SIZE;
    const rows = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        priceMinor: price,
        ...pictureColumns,
        ...unitColumns,
        ...noteColumns,
        ...availabilityColumns,
        ...partsColumns,
        pairedCount: pairedCountOf(),
      })
      .from(products)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map(toListItem),
      pagination: {
        page,
        pageSize,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / pageSize),
      },
    };
  }

  /**
   * Product search by name (FR-SEARCH-01…03). Runs in a transaction only
   * because the trigram threshold is set with `SET LOCAL`; a query too short to
   * be worth running returns an empty page without touching the database.
   *
   * `sort` (FR-SEARCH-04) only reorders the rows — which rows match is the
   * matcher's business, so a name or price sort still searches, it just does
   * not rank. See product-sort.ts for the ordering itself.
   *
   * Every executed search is logged (NFR-OPS-05); a query too short to run is
   * not a search and is not recorded.
   */
  async searchProducts(
    rawQuery: string,
    page: number,
    sort: SearchSort,
    tierId: string | null = null,
    attributes: AttributeSelection[] = [],
  ): Promise<SearchResult> {
    const price = livePriceMinor(tierId);
    const pageSize = CATALOG_PAGE_SIZE;
    const query = parseSearchQuery(rawQuery, this.alternateLayout);
    if (!query) {
      return {
        items: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
        facets: [],
      };
    }

    const scope = and(publiclyVisible, searchCondition(query));
    const definitions = await this.reader.attributeDefinitions();
    const startedAt = Date.now();

    return this.db.transaction(async (tx) => {
      await tx.execute(setSearchThreshold);
      // The trigram threshold is set for this transaction only, so everything
      // that has to see the same result set runs inside it — the facets
      // included.
      const selections = resolveSelections(attributes, definitions);
      const where = and(scope, ...selectionConditions(tx, selections));

      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(products)
        .where(where);

      const rows = await tx
        .select({
          slug: products.slug,
          name: products.name,
          priceMinor: price,
          ...pictureColumns,
          ...unitColumns,
          ...noteColumns,
          ...availabilityColumns,
          ...partsColumns,
          pairedCount: pairedCountOf(),
        })
        .from(products)
        .where(where)
        .orderBy(...productOrderBy(sort, relevanceScore(query), price))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      const items = rows.map(toListItem);
      const facets = await buildFacets(tx, scope, definitions, selections);

      this.searchLog.record({
        query: query.normalized,
        terms: query.terms.length,
        results: Number(total),
        page,
        durationMs: Date.now() - startedAt,
      });

      return {
        items,
        pagination: {
          page,
          pageSize,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / pageSize),
        },
        facets,
      };
    });
  }

  /**
   * Type-ahead suggestions for the search bar (FR-SEARCH-05/06). Deliberately
   * the same candidate set, ordering and tile columns as `searchProducts`, so
   * the dropdown is a truthful prefix of the result page and a row is the tile
   * it would show — only the count, the offset and the facets are dropped,
   * which is what makes this cheap enough to run per keystroke.
   *
   * Beside them, the categories whose names the query matched (FR-SEARCH-07),
   * within the same transaction because the typo tolerance reads the same
   * trigram threshold.
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
        .select({
          slug: products.slug,
          name: products.name,
          priceMinor: price,
          ...pictureColumns,
          ...unitColumns,
          ...noteColumns,
          ...availabilityColumns,
          ...partsColumns,
          pairedCount: pairedCountOf(),
        })
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
   * The first few of `ids` the storefront shows (FR-CAT-01) — a category with
   * nothing publicly visible beneath it is absent from the overview, and must
   * not be the one door into it — each with its parent's name.
   */
  private async shownCategories(ids: string[]): Promise<SearchCategory[]> {
    if (!ids.length) return [];
    const rows = await this.reader.categoryRows();
    const stocked = stockedCategoryIds(rows, await this.liveCategoryIds());
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

  /**
   * Every indexable slug for the sitemap: the categories with something to
   * show, all publicly visible products, and the DB-backed static pages, each
   * with its `updatedAt` for `<lastmod>` (a page's id is its public slug).
   * Returns bare slugs only — the SSR server builds the absolute URLs.
   */
  async getSitemap(): Promise<{
    categories: SitemapEntry[];
    products: SitemapEntry[];
    pages: SitemapEntry[];
  }> {
    const [categoryRows, productRows, pageRows] = await Promise.all([
      this.db
        .select({
          id: categories.id,
          parentId: categories.parentId,
          slug: categories.slug,
          updatedAt: categories.updatedAt,
        })
        .from(categories)
        .orderBy(asc(categories.slug)),
      this.db
        .select({ slug: products.slug, updatedAt: products.updatedAt })
        .from(products)
        .where(publiclyVisible)
        .orderBy(asc(products.slug)),
      this.db
        .select({
          slug: pageVersions.slug,
          updatedAt: max(pageVersions.createdAt).mapWith(
            pageVersions.createdAt,
          ),
        })
        .from(pageVersions)
        .groupBy(pageVersions.slug)
        .orderBy(asc(pageVersions.slug)),
    ]);
    const toEntry = (r: { slug: string; updatedAt: Date }): SitemapEntry => ({
      slug: r.slug,
      updatedAt: r.updatedAt.toISOString(),
    });
    // An empty category is not linked to anywhere, so it is not offered to a
    // crawler either.
    const stocked = stockedCategoryIds(
      categoryRows,
      await this.liveCategoryIds(),
    );
    return {
      categories: categoryRows
        .filter((row) => stocked.has(row.id))
        .map(toEntry),
      products: productRows.map(toEntry),
      pages: pageRows.map(toEntry),
    };
  }

  /**
   * The filterable attributes the whole-catalogue listing offers
   * (FR-ATTR-12): the ticked rows of its own panel, in its order — none when
   * nothing has been ticked, since that panel is opt-in.
   */
  private async catalogDefinitions(): Promise<DefinitionRow[]> {
    const rows = await this.db
      .select({ definition: attributeDefinitions })
      .from(catalogAttributes)
      .innerJoin(
        attributeDefinitions,
        eq(attributeDefinitions.id, catalogAttributes.attributeId),
      )
      .where(eq(catalogAttributes.hidden, false))
      .orderBy(asc(catalogAttributes.sortOrder));
    return rows.map((row) => row.definition);
  }

  /**
   * The products a product is sold together with (FR-SET-05), as tiles that can
   * be bought where they are listed — the same shape a listing draws, so the
   * panel behind the marker is a short listing rather than a fourth rendering
   * of a product.
   *
   * Only what a customer could add: a withdrawn or unpublished counterpart
   * keeps its edge for the admin and has no place here. Null distinguishes a
   * product that does not exist from one that is sold with nothing — the
   * caller answers 404 for the first and an empty list for the second.
   *
   * In name order, as the editor lists them: the admin and the customer see
   * the same set in the same order.
   */
  async getProductPairings(
    slug: string,
    tierId: string | null = null,
  ): Promise<ProductListItem[] | null> {
    const [product] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.slug, slug), publiclyVisible))
      .limit(1);
    if (!product) return null;

    const counterpartId = counterpartOf(product.id);
    const rows = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        priceMinor: livePriceMinor(tierId),
        ...pictureColumns,
        ...unitColumns,
        ...noteColumns,
        ...availabilityColumns,
        ...partsColumns,
        pairedCount: pairedCountOf(),
      })
      .from(productPairings)
      .innerJoin(products, and(eq(products.id, counterpartId), publiclyVisible))
      .where(involves(product.id))
      .orderBy(asc(products.name));
    return rows.map(toListItem);
  }

  /**
   * The main page's row (FR-CAT-09): as many featured products as fit, the
   * rest of the row drawn from everything else, out-of-stock ones never. The
   * query takes the featured first; the shuffle then hides that they were.
   */
  async getFeaturedProducts(
    tierId: string | null = null,
  ): Promise<ProductListItem[]> {
    const rows = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        priceMinor: livePriceMinor(tierId),
        ...pictureColumns,
        ...unitColumns,
        ...noteColumns,
        ...availabilityColumns,
        ...partsColumns,
        pairedCount: pairedCountOf(),
      })
      .from(products)
      .where(and(publiclyVisible, featuredRowCandidate))
      .orderBy(...featuredRowOrder)
      .limit(FEATURED_ROW_SIZE);
    return shuffled(rows).map(toListItem);
  }

  async getProduct(
    slug: string,
    tierId: string | null = null,
  ): Promise<ProductDetail | null> {
    return (
      (await this.reader.readProduct(slug, tierId, publiclyVisible))?.product ??
      null
    );
  }
}
