import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
} from 'drizzle-orm';
import {
  AttributeSelection,
  CATALOG_PAGE_SIZE,
  CategoryCrumb,
  Facet,
  CategoryNode,
  ProductDetailAttribute,
  ProductDetail,
  ProductListItem,
  ProductSort,
  SearchSort,
  SearchSuggestion,
  SubcategoryLink,
  SEARCH_SUGGESTION_LIMIT,
  SitemapEntry,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import {
  attributeDefinitions,
  categories,
  pages,
  productAttributes,
  products,
} from '../db/schema';
import {
  ancestorsOf,
  buildCategoryTree,
  categoryBySlug,
  CategoryRow,
  descendantIds,
  directChildren,
} from './catalog-tree';
import {
  parseSearchQuery,
  relevanceScore,
  searchCondition,
  setSearchThreshold,
} from './product-search';
import { resolvedPiecePrice, resolvedPriceMinor } from './product-price';
import { productOrderBy } from './product-sort';
import {
  boxDimensionsOf,
  displayPriceMinor,
  packagingOf,
  toListItem,
  unitColumns,
  unitPricesOf,
} from './product-view';
import {
  buildFacets,
  resolveSelections,
  selectionConditions,
} from './product-facets';
import { SearchLogger } from './search.logger';

interface SearchResult {
  items: ProductListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
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
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  facets: Facet[];
}

/**
 * What the storefront may show: live, and published by an admin. Defined once
 * because forgetting it on a new read is silent — the page would simply serve a
 * product nobody has reviewed.
 */
const publiclyVisible = and(
  isNull(products.deletedAt),
  isNotNull(products.publishedAt),
);

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private readonly searchLog: SearchLogger,
  ) {}

  private categoryRows(): Promise<CategoryRow[]> {
    return this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        shortName: categories.shortName,
        parentId: categories.parentId,
        image: categories.image,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async getCategoryTree(): Promise<CategoryNode[]> {
    return buildCategoryTree(await this.categoryRows());
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
    sort: ProductSort,
    tierId: string | null = null,
    attributes: AttributeSelection[] = [],
  ): Promise<CategoryProductsResult | null> {
    const price = resolvedPriceMinor(tierId);
    const piecePrice = resolvedPiecePrice(tierId);
    const rows = await this.categoryRows();
    const category = categoryBySlug(rows, slug);
    if (!category) return null;

    const ids = descendantIds(category.id, rows);
    const scope = and(inArray(products.categoryId, ids), publiclyVisible);
    const definitions = await this.attributeDefinitions();
    const selections = resolveSelections(attributes, definitions);
    const where = and(scope, ...selectionConditions(this.db, selections));

    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(products)
      .where(where);

    const pageSize = CATALOG_PAGE_SIZE;
    const rowsPage = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        priceMinor: price,
        images: products.images,
        ...unitColumns,
      })
      .from(products)
      .where(where)
      .orderBy(...productOrderBy(sort, undefined, piecePrice))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const items = rowsPage.map(toListItem);
    const facets = await buildFacets(this.db, scope, definitions, selections);

    return {
      category: {
        slug: category.slug,
        name: category.name,
        shortName: category.shortName,
        ancestors: ancestorsOf(category.id, rows),
        subcategories: directChildren(category.id, rows),
      },
      items,
      pagination: {
        page,
        pageSize,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / pageSize),
      },
      facets,
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
    const price = resolvedPriceMinor(tierId);
    const piecePrice = resolvedPiecePrice(tierId);
    const pageSize = CATALOG_PAGE_SIZE;
    const query = parseSearchQuery(rawQuery);
    if (!query) {
      return {
        items: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
        facets: [],
      };
    }

    const scope = and(publiclyVisible, searchCondition(query));
    const definitions = await this.attributeDefinitions();
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
          images: products.images,
          ...unitColumns,
        })
        .from(products)
        .where(where)
        .orderBy(...productOrderBy(sort, relevanceScore(query), piecePrice))
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
   * Type-ahead suggestions for the search bar (FR-SEARCH-05). Deliberately the
   * same candidate set and the same ordering as `searchProducts`, so the
   * dropdown is a truthful prefix of the result page — only the count, the
   * offset and the tile columns are dropped, which is what makes this cheap
   * enough to run per keystroke.
   */
  async getSearchSuggestions(rawQuery: string): Promise<SearchSuggestion[]> {
    const query = parseSearchQuery(rawQuery);
    if (!query) return [];

    return this.db.transaction(async (tx) => {
      await tx.execute(setSearchThreshold);

      return tx
        .select({ slug: products.slug, name: products.name })
        .from(products)
        .where(and(publiclyVisible, searchCondition(query)))
        .orderBy(
          desc(relevanceScore(query)),
          asc(products.name),
          asc(products.id),
        )
        .limit(SEARCH_SUGGESTION_LIMIT);
    });
  }

  /**
   * Every indexable slug for the sitemap: all categories, all non-deleted
   * products, and the DB-backed static pages, each with its `updatedAt` for
   * `<lastmod>` (a page's id is its public slug). Returns bare slugs only — the
   * SSR server builds the absolute URLs.
   */
  async getSitemap(): Promise<{
    categories: SitemapEntry[];
    products: SitemapEntry[];
    pages: SitemapEntry[];
  }> {
    const [categoryRows, productRows, pageRows] = await Promise.all([
      this.db
        .select({ slug: categories.slug, updatedAt: categories.updatedAt })
        .from(categories)
        .orderBy(asc(categories.slug)),
      this.db
        .select({ slug: products.slug, updatedAt: products.updatedAt })
        .from(products)
        .where(publiclyVisible)
        .orderBy(asc(products.slug)),
      this.db
        .select({ slug: pages.id, updatedAt: pages.updatedAt })
        .from(pages)
        .orderBy(asc(pages.id)),
    ]);
    const toEntry = (r: { slug: string; updatedAt: Date }): SitemapEntry => ({
      slug: r.slug,
      updatedAt: r.updatedAt.toISOString(),
    });
    return {
      categories: categoryRows.map(toEntry),
      products: productRows.map(toEntry),
      pages: pageRows.map(toEntry),
    };
  }

  /**
   * The filterable-attribute registry in panel order (FR-ATTR-01). Read on
   * every listing: it is a handful of rows, and it is what turns a URL slug
   * into the attribute key products actually carry.
   */
  private attributeDefinitions() {
    return this.db
      .select()
      .from(attributeDefinitions)
      .orderBy(
        asc(attributeDefinitions.sortOrder),
        asc(attributeDefinitions.name),
      );
  }

  /**
   * A product's attributes in the admin's row order — `sortOrder` is the order,
   * so it has to be asked for explicitly.
   *
   * Left-joined to the registry by name, for the unit and the filter link: a
   * key matching no definition still renders, exactly as it is stored
   * (FR-ATTR-02).
   */
  private async attributesFor(
    productId: string,
  ): Promise<ProductDetailAttribute[]> {
    const rows = await this.db
      .select({
        key: productAttributes.key,
        value: productAttributes.value,
        numeric: productAttributes.valueNumeric,
        unit: attributeDefinitions.unit,
        slug: attributeDefinitions.slug,
        type: attributeDefinitions.type,
      })
      .from(productAttributes)
      .leftJoin(
        attributeDefinitions,
        eq(attributeDefinitions.name, productAttributes.key),
      )
      .where(eq(productAttributes.productId, productId))
      .orderBy(asc(productAttributes.sortOrder));

    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      unit: row.unit,
      // Only where a facet would actually offer this value: a number
      // attribute's unparseable value has no checkbox to link to (FR-ATTR-03).
      filterSlug:
        row.slug && (row.type !== 'number' || row.numeric !== null)
          ? row.slug
          : null,
    }));
  }

  async getProduct(
    slug: string,
    tierId: string | null = null,
  ): Promise<ProductDetail | null> {
    const [product] = await this.db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        priceMinor: resolvedPriceMinor(tierId),
        descriptionHtml: products.descriptionHtml,
        images: products.images,
        categoryId: products.categoryId,
        boxVolume: products.boxVolume,
        boxWeight: products.boxWeight,
        boxCount: products.boxCount,
        ...unitColumns,
      })
      .from(products)
      .where(and(eq(products.slug, slug), publiclyVisible))
      .limit(1);
    if (!product) return null;

    const [rows, attributes] = await Promise.all([
      this.categoryRows(),
      this.attributesFor(product.id),
    ]);
    const category = rows.find((row) => row.id === product.categoryId);
    if (!category) return null;

    return {
      slug: product.slug,
      name: product.name,
      priceMinor: displayPriceMinor(product),
      prices: unitPricesOf(product),
      packaging: packagingOf(product),
      boxDimensions: boxDimensionsOf(product),
      descriptionHtml: product.descriptionHtml,
      images: product.images,
      attributes,
      category: {
        slug: category.slug,
        name: category.name,
        shortName: category.shortName,
        ancestors: ancestorsOf(category.id, rows),
      },
    };
  }
}
