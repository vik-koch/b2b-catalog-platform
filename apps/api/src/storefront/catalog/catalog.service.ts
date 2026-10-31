import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgColumn } from 'drizzle-orm/pg-core';
import { and, asc, count, eq, inArray, max, SQL } from 'drizzle-orm';
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
  FEATURED_ROW_SIZE,
  SitemapEntry,
} from '@b2b-catalog-platform/shared/storefront/catalog';
import { Pagination } from '@b2b-catalog-platform/shared/platform';
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
import { livePriceMinor } from '../../core/catalog/product-price';
import { catalogOrderBy } from './listing-sort';
import {
  buildCategoryTree,
  categoryTreeOrder,
  directChildren,
} from './category-tree';
import {
  listItemColumns,
  publiclyVisible,
  toListItem,
} from '../../core/catalog/product-view';
import { counterpartOf, involves } from '../../core/catalog/product-pairings';
import { paginationOf } from '../../platform/pagination';
import { stockedCategories } from './stocked-categories';
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
import { CatalogReader } from '../../core/catalog/catalog-reader';

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

/**
 * The storefront's catalog reads except search: the tree, the listings, the
 * product page and its pairings, the main page's row and the sitemap.
 */
@Injectable()
export class CatalogService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private readonly reader: CatalogReader,
  ) {}

  /** The public tree (FR-CAT-01/02), pruned to what has something to show. */
  async getCategoryTree(): Promise<CategoryNode[]> {
    const rows = await this.reader.categoryRows();
    const stocked = await stockedCategories(this.db, rows);
    return buildCategoryTree(rows.filter((row) => stocked.has(row.id)));
  }

  /**
   * The catalogue index (FR-CAT-02/03): a category's listing one level up,
   * with the top-level categories as its chips and the whole-catalogue panel
   * as its filters (FR-ATTR-12).
   */
  async getCatalogProducts(
    page: number,
    sort: CatalogSort,
    tierId: string | null = null,
    attributes: AttributeSelection[] = [],
  ): Promise<CatalogProductsResult> {
    const price = livePriceMinor(tierId);
    const rows = await this.reader.categoryRows();
    const stocked = await stockedCategories(this.db, rows);
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
   * A category's products (FR-CAT-03/04), narrowed by the selection
   * (FR-ATTR-05). Scope and selection stay apart: the facets are built from
   * the scope, so their values do not shrink as they are clicked.
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
    // Scoping reads every row, so a category works with nothing else visible;
    // the chips read the pruned set and never lead to an empty grid.
    const stocked = await stockedCategories(this.db, rows);
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
   * part of the selection it carries and what that leaves beneath it
   * (FR-ATTR-13). One grouped count per distinct part, usually one in all.
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

  /** One page of a browsed listing and its count. */
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
      .select(listItemColumns(price))
      .from(products)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map(toListItem),
      pagination: paginationOf(page, pageSize, Number(total)),
    };
  }

  /** Every indexable slug for the sitemap: stocked categories, visible
   * products and the stored pages, each with its last change. */
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
    const stocked = await stockedCategories(this.db, categoryRows);
    return {
      categories: categoryRows
        .filter((row) => stocked.has(row.id))
        .map(toEntry),
      products: productRows.map(toEntry),
      pages: pageRows.map(toEntry),
    };
  }

  /** The whole-catalogue listing's filters (FR-ATTR-12): its own panel's
   * ticked rows, none until something is ticked. */
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
   * The products a product is sold together with (FR-SET-05) that a customer
   * could add, as tiles, in the editor's name order. Null for a product that
   * does not exist, an empty list for one sold with nothing.
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
      .select(listItemColumns(livePriceMinor(tierId)))
      .from(productPairings)
      .innerJoin(products, and(eq(products.id, counterpartId), publiclyVisible))
      .where(involves(product.id))
      .orderBy(asc(products.name));
    return rows.map(toListItem);
  }

  /** The main page's row (FR-CAT-09); see featured-row.ts. */
  async getFeaturedProducts(
    tierId: string | null = null,
  ): Promise<ProductListItem[]> {
    const rows = await this.db
      .select(listItemColumns(livePriceMinor(tierId)))
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
