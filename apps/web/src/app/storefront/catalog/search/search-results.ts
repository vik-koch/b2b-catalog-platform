import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, resource } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { SEARCH_SORTS } from '@b2b-catalog-platform/shared/core/catalog';
import { EditActions } from '../../../shared/edit-mode/edit-actions';
import { editAwareContent } from '../../../shared/edit-mode/edit-aware-content';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { usePageSeo } from '../../../shared/core/page-seo';
import { stableValue } from '../../../shared/core/stable-value';
import { LoadErrorView } from '../../pages/load-error-view';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Pagination } from '@b2b-catalog-platform/ui/lists/pagination';
import { AppliedFilters } from '../filters/applied-filters';
import { CatalogSearchService } from './catalog-search.service';
import {
  FACET_COLUMN,
  FACET_HEADER_SORT,
  FACET_LAYOUT,
  FACET_SIBLING,
  FACET_SIBLING_ALONE,
  FacetPanel,
} from '../filters/facet-panel';
import { anyStatus } from '../ui/product-status-line';
import { ProductLayoutService } from '../product-layout';
import { ProductLayoutToggle } from '../product-layout-toggle';
import { PRODUCT_ROWS, ProductRow } from '../ui/product-row';
import { ProductSortSelect } from '../filters/product-sort-select';
import { listingParams } from '../listing-params';
import { PRODUCT_GRID, ProductTile } from '../ui/product-tile';
import { useTaxStatement } from '../../../core/catalog/pricing/tax-statement';

/**
 * Search results — the same product tiles the category grid
 * renders, in relevance order, with no category chrome around them.
 */
@Component({
  selector: 'app-search-results',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    EditActions,
    ProductTile,
    ProductRow,
    ProductLayoutToggle,
    ProductSortSelect,
    FacetPanel,
    AppliedFilters,
    Button,
    LoadErrorView,
    Pagination,
  ],
  template: `
    <!-- Everything inside measures this container rather than the window, so
         the heading, the chips and the listing take their narrow shape in one
         step: a viewport breakpoint and a container query on the same page
         disagree by the width of the frame and the scrollbar. The section's
         own padding is the exception — no element can query its own
         container. -->
    <section
      class="@container/listing pb-6"
      [attr.aria-busy]="results.isLoading() ? 'true' : null"
    >
      @if (results.error()) {
        <h1
          class="text-2xl font-medium tracking-tight
                 @min-[38rem]/listing:text-3xl"
        >
          {{ heading() }}
        </h1>
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
              <h1
                class="text-2xl font-medium tracking-tight
                       @min-[38rem]/listing:text-3xl"
              >
                {{ heading() }}
              </h1>
            </div>
            <!-- The chips share the heading's row rather than getting one of
                 their own: a row that appears with the first selection would
                 push the grid down as it was ticked. -->
            <app-applied-filters
              class="mt-3 hidden min-w-0 flex-1 @min-[38rem]/listing:block"
              [facets]="data.facets"
            />
          </div>
          <!-- Filters left, listing right, from the width where the panel
               costs the listing neither a column nor an arrangement (see
               FACET_LAYOUT); a disclosure above it below that. -->
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
                <!-- How many results there are, and the two ways of asking
                     for them differently — over the grid and at the height of
                     the filter column's heading, exactly as the category
                     listing arranges them. The count lives here rather than
                     under the heading: it is a fact about the listing below
                     it, and the listings say it in one place. The sort keeps
                     this row only while there is a filter column to hold the
                     other copy of it. -->
                <div class="mb-4 flex h-8 items-center justify-between gap-4">
                  <p class="text-sm text-ink-subtle">
                    {{ resultCount(data.pagination.total) }}
                  </p>
                  <div class="flex items-center gap-3">
                    <app-product-sort-select
                      shape="segments"
                      [class]="data.facets.length ? headerSortAt : ''"
                      [value]="sortKey()"
                      defaultSort="relevance"
                      [options]="sortOptions"
                    />
                    <app-product-layout-toggle />
                  </div>
                </div>
              }
              <!-- The same products, drawn the way the visitor last asked for
                   in either listing: fitted cards, or full-width lines. -->
              <ul [class]="list()" [class.listing-held]="results.isLoading()">
                <!-- The same cluster the category listing puts on its items:
                     a product found by searching is as editable as one found
                     by browsing, and reaching it through the admin list to
                     fix a typo is the long way round. -->
                <ng-template #productEdit let-slug>
                  @if (editControls(); as editText) {
                    <app-edit-actions
                      variant="tile"
                      [editLink]="['/admin/products', slug, 'edit']"
                      [editParams]="editorFrom()"
                      [editLabel]="editText.editProduct"
                    />
                  }
                </ng-template>
                <!-- Asked once for the page: a listing where one product
                     states a stock leaves the line for all of them, so the
                     names sit level. -->
                @let reserveStatus = anyStatus(data.items);

                @for (item of data.items; track item.slug) {
                  <li [class]="cards() ? 'h-full' : ''">
                    @if (cards()) {
                      <app-product-tile
                        [item]="item"
                        [reserveStatus]="reserveStatus"
                      >
                        <ng-container
                          [ngTemplateOutlet]="productEdit"
                          [ngTemplateOutletContext]="{ $implicit: item.slug }"
                        />
                      </app-product-tile>
                    } @else {
                      <app-product-row [item]="item">
                        <ng-container
                          ngProjectAs="[rowOverlay]"
                          [ngTemplateOutlet]="productEdit"
                          [ngTemplateOutletContext]="{ $implicit: item.slug }"
                        />
                      </app-product-row>
                    }
                  </li>
                }
              </ul>
              <!-- What the prices include, where the deployment says so beside
                   them (NFR-LEGAL-11). Once for the page, naming no rate. -->
              @if (taxNote && data.items.length) {
                <p class="mt-4 text-xs text-ink-subtle">{{ taxNote }}</p>
              }

              <ui-pagination
                class="mt-8"
                link="/search"
                [page]="data.pagination.page"
                [totalPages]="data.pagination.totalPages"
                [queryParams]="pageParams"
              />
            </div>
          </div>
        } @else if (query()) {
          <h1
            class="text-2xl font-medium tracking-tight
                   @min-[38rem]/listing:text-3xl"
          >
            {{ heading() }}
          </h1>
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
        <h1
          class="text-2xl font-medium tracking-tight
                 @min-[38rem]/listing:text-3xl"
        >
          {{ heading() }}
        </h1>
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
  /** Whether this page of products states any stock at all — see the badge. */
  protected readonly anyStatus = anyStatus;

  protected readonly productGrid = PRODUCT_GRID;
  protected readonly sortOptions = SEARCH_SORTS;

  protected readonly headerSortAt = FACET_HEADER_SORT;
  protected readonly facetLayout = FACET_LAYOUT;
  protected readonly facetColumn = FACET_COLUMN;
  protected readonly listingColumn = FACET_SIBLING;
  protected readonly listingAlone = FACET_SIBLING_ALONE;
  private readonly productLayout = inject(ProductLayoutService);
  /** Cards or lines — the visitor's standing choice, shared with the category
   * listing. */
  protected readonly cards = computed(
    () => this.productLayout.layout() === 'grid',
  );
  /** Lines, or cards — see the category listing, which makes the same
   * choice. */
  protected list(): string {
    return this.cards() ? PRODUCT_GRID : PRODUCT_ROWS;
  }

  private readonly search = inject(CatalogSearchService);

  protected readonly text = inject(STOREFRONT_TEXT).search;
  protected readonly catalogText = inject(STOREFRONT_TEXT).catalog;
  protected readonly taxNote = useTaxStatement().listing();
  protected readonly filterText = this.catalogText.filters;
  protected readonly skeletons = Array.from({ length: 10 }, (_, i) => i);

  /** Bound from the `q` query param. Named for the parameter, not for what it
   * means, because router input binding matches on the parameter's name. */
  readonly q = input('');
  /** The query as everything else should see it: never null, never padded. */
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
      ? this.text.resultsTitle.replace('{query}', this.query())
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

  /** Held across reloads, so re-sorting swaps the grid instead of blanking it. */
  private readonly shown = stableValue(this.results);

  /** The results and the per-item edit affordances appear together, once both
   * the search and the visitor's role are known — see editAwareContent. */
  private readonly content = editAwareContent({
    ready: computed(() => this.shown() !== undefined),
    section: 'editMode',
  });
  protected readonly editControls = this.content.controls;
  /** The results, once they may be shown. */
  protected readonly visible = computed(() =>
    this.content.ready() ? this.shown() : undefined,
  );
  /** Delayed so a quick search never flashes a skeleton. Only the first load
   * can reach it — a reload still has the previous results on screen. */
  protected readonly showSkeleton = this.content.showSkeleton;

  protected readonly editorFrom = injectEditorReturnParams();

  constructor() {
    usePageSeo({ name: () => this.heading(), noindex: true });
  }

  protected readonly noResults = computed(() =>
    this.text.noResults.replace('{query}', this.query()),
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
