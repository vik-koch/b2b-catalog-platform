import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, resource } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { SEARCH_SORTS } from '@b2b-catalog-platform/shared/core/catalog';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { usePageSeo } from '../../../shared/core/page-seo';
import { stableValue } from '../../../shared/core/stable-value';
import { editAwareContent } from '../../../shared/edit-mode/edit-aware-content';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import { LoadErrorView } from '../../platform/load-error-view';
import { AppliedFilters } from '../filters/applied-filters';
import {
  FACET_COLUMN,
  FACET_HEADER_SORT,
  FACET_LAYOUT,
  FACET_SIBLING,
  FACET_SIBLING_ALONE,
  FacetPanel,
} from '../filters/facet-panel';
import { ProductSortSelect } from '../filters/product-sort-select';
import { listingParams } from '../listing-params';
import { ProductLayoutService } from '../product-layout';
import { ProductLayoutToggle } from '../product-layout-toggle';
import { PRODUCT_GRID } from '../ui/product-tile';
import { ProductListing } from '../ui/product-listing';
import { CatalogSearchService } from './catalog-search.service';

/** Search results (FR-SEARCH-01…04): the category listing's cards and lines,
 * in relevance order, without the category chrome. */
@Component({
  selector: 'app-search-results',
  imports: [
    ProductListing,
    NgTemplateOutlet,
    RouterLink,
    ProductLayoutToggle,
    ProductSortSelect,
    FacetPanel,
    AppliedFilters,
    Button,
    LoadErrorView,
  ],
  template: `
    <ng-template #title>
      <h1
        class="text-2xl font-medium tracking-tight
               @min-[38rem]/listing:text-3xl"
      >
        {{ heading() }}
      </h1>
    </ng-template>
    <!-- Everything inside measures this container, not the window, so all
         of it turns narrow in one step. -->
    <section
      class="@container/listing pb-6"
      [attr.aria-busy]="results.isLoading() ? 'true' : null"
    >
      @if (results.error()) {
        <ng-container [ngTemplateOutlet]="title" />
        <app-load-error-view [message]="text.loadError" />
      } @else if (visible(); as data) {
        @if (data.items.length || hasSelection()) {
          <div
            class="flex flex-row flex-wrap justify-between items-stretch gap-3"
          >
            <div
              class="flex w-full flex-col justify-between
                     @min-[38rem]/listing:w-auto"
            >
              <ng-container [ngTemplateOutlet]="title" />
            </div>
            <app-applied-filters
              class="mt-3 hidden min-w-0 flex-1 @min-[38rem]/listing:block"
              [facets]="data.facets"
            />
          </div>
          <div class="mt-6" [class]="facetLayout">
            @if (data.facets.length) {
              <aside [class]="facetColumn">
                <app-facet-panel
                  [facets]="data.facets"
                  [sort]="sortKey()"
                  defaultSort="relevance"
                  [sortOptions]="sortOptions"
                />
              </aside>
            }
            <div [class]="data.facets.length ? listingColumn : listingAlone">
              @if (!data.items.length) {
                <p class="text-ink-subtle">{{ filterText.noMatches }}</p>
              } @else {
                <app-product-listing
                  [items]="data.items"
                  [cards]="cards()"
                  [loading]="results.isLoading()"
                  [countLabel]="resultCount(data.pagination.total)"
                  link="/search"
                  [page]="data.pagination.page"
                  [totalPages]="data.pagination.totalPages"
                  [pageParams]="pageParams"
                  [editText]="editControls()"
                  [editorFrom]="editorFrom()"
                >
                  <app-product-sort-select
                    shape="segments"
                    [class]="data.facets.length ? headerSortAt : ''"
                    [value]="sortKey()"
                    defaultSort="relevance"
                    [options]="sortOptions"
                  />
                  <app-product-layout-toggle />
                </app-product-listing>
              }
            </div>
          </div>
        } @else if (query()) {
          <ng-container [ngTemplateOutlet]="title" />
          <p class="mt-4 text-ink-subtle">
            {{ noResults() }}
          </p>
          <p class="mt-2 text-ink-subtle">{{ text.noResultsHint }}</p>
          <a
            routerLink="/catalog"
            uiButton
            variant="secondary"
            class="mt-6 inline-flex"
            >{{ catalogText.backToCatalog }}</a
          >
        } @else {
          <p class="mt-8 text-ink-subtle">{{ text.emptyQuery }}</p>
        }
      } @else if (showSkeleton()) {
        <ng-container [ngTemplateOutlet]="title" />
        <div class="mt-8 animate-pulse" aria-hidden="true">
          <div [class]="productGrid">
            @for (i of skeletons; track i) {
              <div class="aspect-square rounded-lg bg-skeleton"></div>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class SearchResults {
  protected readonly productGrid = PRODUCT_GRID;
  protected readonly sortOptions = SEARCH_SORTS;

  protected readonly headerSortAt = FACET_HEADER_SORT;
  protected readonly facetLayout = FACET_LAYOUT;
  protected readonly facetColumn = FACET_COLUMN;
  protected readonly listingColumn = FACET_SIBLING;
  protected readonly listingAlone = FACET_SIBLING_ALONE;
  private readonly productLayout = inject(ProductLayoutService);
  protected readonly cards = computed(
    () => this.productLayout.layout() === 'grid',
  );

  private readonly search = inject(CatalogSearchService);

  protected readonly text = inject(STOREFRONT_TEXT).search;
  protected readonly catalogText = inject(STOREFRONT_TEXT).catalog;
  protected readonly filterText = this.catalogText.filters;
  protected readonly skeletons = Array.from({ length: 10 }, (_, i) => i);

  /** Named for the query parameter, which router input binding matches. */
  readonly q = input('');
  protected readonly query = computed(() => this.q().trim());
  readonly page = input('1');
  readonly sort = input('');
  readonly attr = input<string | readonly string[] | undefined>(undefined);

  private readonly params = listingParams(
    { page: this.page, sort: this.sort, attr: this.attr },
    SEARCH_SORTS,
    'relevance',
  );
  protected readonly sortKey = this.params.sort;
  protected readonly hasSelection = this.params.hasSelection;

  protected readonly heading = computed(() =>
    this.query()
      ? fillText(this.text.resultsTitle, { query: this.query() })
      : this.text.submit,
  );

  protected readonly results = resource({
    params: () => ({
      q: this.query(),
      page: this.params.page(),
      sort: this.params.sort(),
      attr: this.params.attr(),
    }),
    loader: ({ params }) =>
      this.search.searchProducts(
        params.q,
        params.page,
        params.sort,
        params.attr,
      ),
  });

  /** Held across reloads, so re-sorting swaps the grid without blanking it. */
  private readonly shown = stableValue(this.results);

  private readonly content = editAwareContent({
    ready: computed(() => this.shown() !== undefined),
    section: 'editMode',
  });
  protected readonly editControls = this.content.controls;
  protected readonly visible = computed(() =>
    this.content.ready() ? this.shown() : undefined,
  );
  protected readonly showSkeleton = this.content.showSkeleton;

  protected readonly editorFrom = injectEditorReturnParams();

  constructor() {
    usePageSeo({ name: () => this.heading(), noindex: true });
  }

  protected readonly noResults = computed(() =>
    fillText(this.text.noResults, { query: this.query() }),
  );

  protected resultCount(total: number): string {
    return fillText(this.text.resultCount, { count: total });
  }

  protected readonly pageParams = (page: number): Params => ({
    q: this.query(),
    page,
    sort: this.params.sortParam(),
    attr: this.params.attrParam(),
  });
}
