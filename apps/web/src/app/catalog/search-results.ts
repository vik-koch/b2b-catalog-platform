import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  encodeAttributeParams,
  parseAttributeParams,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { EditActions } from '../admin/edit-actions';
import { editAwareContent } from '../admin/edit-aware-content';
import { injectEditorReturnParams } from '../admin/editor-return';
import { usePageSeo } from '../core/page-seo';
import { stableValue } from '../core/stable-value';
import { LoadErrorView } from '../pages/load-error-view';
import { Button } from '../ui/button';
import { AppliedFilters } from './applied-filters';
import { CatalogService } from './catalog.service';
import { FACET_COLUMN, FACET_LAYOUT, FacetPanel } from './facet-panel';
import { ProductLayoutService } from './product-layout';
import { ProductLayoutToggle } from './product-layout-toggle';
import { PRODUCT_ROWS, ProductRow } from './product-row';
import { PRODUCT_GRID, ProductTile } from './product-tile';
import {
  ProductSortSelect,
  resolveSearchSort,
  sortParam,
} from './product-sort-select';

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
  ],
  template: `
    <!-- Everything inside measures this container rather than the window, so
         the heading, the chips and the listing take their narrow shape in one
         step: a viewport breakpoint and a container query on the same page
         disagree by the width of the frame and the scrollbar. The section's
         own padding is the exception — no element can query its own
         container. -->
    <section
      class="@container/listing pb-8 sm:pb-12"
      [attr.aria-busy]="results.isLoading() ? 'true' : null"
    >
      @if (results.error()) {
        <h1
          class="text-2xl font-medium tracking-tight @min-[38rem]/listing:text-3xl"
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
              class="flex w-full flex-col justify-between @min-[38rem]/listing:w-auto"
            >
              <h1
                class="text-2xl font-medium tracking-tight @min-[38rem]/listing:text-3xl"
              >
                {{ heading() }}
              </h1>
              <p class="mt-2 text-sm text-subtle">
                {{ resultCount(data.pagination.total) }}
              </p>
            </div>
            <!-- The chips share the heading's row rather than getting one of
                 their own: a row that appears with the first selection would
                 push the grid down as it was ticked. -->
            <app-applied-filters
              class="mt-3 hidden min-w-0 flex-1 @min-[38rem]/listing:block"
              [facets]="data.facets"
            />
            <div
              class="mt-2 flex w-full items-end justify-end gap-3 @min-[38rem]/listing:w-auto"
            >
              <app-product-sort-select
                [value]="sortKey()"
                defaultSort="relevance"
                [withRelevance]="true"
              />
              <app-product-layout-toggle />
            </div>
          </div>
          <!-- Filters left, listing right, from the width where the panel
               costs the listing neither a column nor an arrangement (see
               FACET_LAYOUT); a disclosure above it below that. -->
          <div class="mt-6" [class]="facetLayout">
            @if (data.facets.length) {
              <aside [class]="facetColumn">
                <app-facet-panel [facets]="data.facets" />
              </aside>
            }
            <div class="min-w-0 flex-1">
              @if (!data.items.length) {
                <p class="text-muted">{{ filterText.noMatches }}</p>
              }
              <!-- The same products, drawn the way the visitor last asked for
                   in either listing: fitted cards, or full-width lines. -->
              <ul [class]="list()">
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
                @for (item of data.items; track item.slug) {
                  <li [class]="cards() ? 'h-full' : ''">
                    @if (cards()) {
                      <app-product-tile [item]="item">
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

              @if (data.pagination.totalPages > 1) {
                <nav
                  class="mt-10 flex items-center justify-center gap-4 text-sm"
                  [attr.aria-label]="catalogText.pageStatus"
                >
                  @if (data.pagination.page > 1) {
                    <a
                      routerLink="/search"
                      [queryParams]="{
                        q: query(),
                        page: data.pagination.page - 1,
                        sort: sortParam(),
                        attr: attrParam(),
                      }"
                      appButton
                      variant="ghost"
                      size="sm"
                      >{{ catalogText.prevPage }}</a
                    >
                  } @else {
                    <span class="px-3 py-1.5 text-stone-300">{{
                      catalogText.prevPage
                    }}</span>
                  }
                  <span class="text-subtle">{{
                    pageStatus(data.pagination)
                  }}</span>
                  @if (data.pagination.page < data.pagination.totalPages) {
                    <a
                      routerLink="/search"
                      [queryParams]="{
                        q: query(),
                        page: data.pagination.page + 1,
                        sort: sortParam(),
                        attr: attrParam(),
                      }"
                      appButton
                      variant="ghost"
                      size="sm"
                      >{{ catalogText.nextPage }}</a
                    >
                  } @else {
                    <span class="px-3 py-1.5 text-stone-300">{{
                      catalogText.nextPage
                    }}</span>
                  }
                </nav>
              }
            </div>
          </div>
        } @else if (query()) {
          <h1
            class="text-2xl font-medium tracking-tight @min-[38rem]/listing:text-3xl"
          >
            {{ heading() }}
          </h1>
          <p class="mt-4 text-subtle">
            {{ noResults() }}
          </p>
          <p class="mt-2 text-subtle">{{ text.noResultsHint }}</p>
          <a
            routerLink="/catalog"
            appButton
            variant="secondary"
            class="mt-6 inline-flex"
            >{{ catalogText.backToCatalog }}</a
          >
        } @else {
          <p class="mt-8 text-muted">{{ text.emptyQuery }}</p>
        }
      } @else if (showSkeleton()) {
        <h1
          class="text-2xl font-medium tracking-tight @min-[38rem]/listing:text-3xl"
        >
          {{ heading() }}
        </h1>
        <div class="mt-8 animate-pulse" aria-hidden="true">
          <div [class]="productGrid">
            @for (i of skeletons; track i) {
              <div class="aspect-square rounded-lg bg-stone-200"></div>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class SearchResults {
  protected readonly productGrid = PRODUCT_GRID;
  protected readonly facetLayout = FACET_LAYOUT;
  protected readonly facetColumn = FACET_COLUMN;
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

  private readonly catalog = inject(CatalogService);

  protected readonly text = inject(APP_TEXT).search;
  protected readonly catalogText = inject(APP_TEXT).catalog;
  protected readonly filterText = this.catalogText.filters;
  protected readonly skeletons = Array.from({ length: 10 }, (_, i) => i);

  /** Bound from the `q` query param. Named for the parameter, not for what it
   * means, because router input binding matches on the parameter's name. */
  readonly q = input('');
  /** The query as everything else should see it: never null, never padded. */
  protected readonly query = computed(() => this.q().trim());
  /** Bound from the `page` query param (a string); coerced and floored to 1. */
  readonly page = input('1');
  protected readonly currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

  /** Bound from the `sort` query param; an unknown key falls back to the
   * default rather than being sent on to the API (FR-SEARCH-04). */
  readonly sort = input('');
  protected readonly sortKey = computed(() => resolveSearchSort(this.sort()));
  /** The sort as pagination links should carry it — absent when default. */
  protected readonly sortParam = computed(() =>
    sortParam(this.sortKey(), 'relevance'),
  );

  /**
   * Bound from the repeated `attr` query parameter (FR-ATTR-07) — a bare string
   * when one value is ticked, an array beyond that, which is why it is read
   * through the shared codec rather than used as it arrives.
   */
  readonly attr = input<string | readonly string[] | undefined>(undefined);
  /** The selection, normalized: duplicates collapsed, malformed entries gone. */
  protected readonly attrParams = computed(() =>
    encodeAttributeParams(parseAttributeParams(this.attr())),
  );
  protected readonly hasSelection = computed(
    () => this.attrParams().length > 0,
  );
  /** The selection as pagination links should carry it — absent when empty, so
   * an unfiltered listing keeps one URL. */
  protected readonly attrParam = computed(() =>
    this.hasSelection() ? this.attrParams() : null,
  );

  protected readonly heading = computed(() =>
    this.query()
      ? this.text.resultsTitle.replace('{query}', this.query())
      : this.text.submit,
  );

  protected readonly results = resource({
    params: () => ({
      q: this.query(),
      page: this.currentPage(),
      sort: this.sortKey(),
      attr: this.attrParams(),
    }),
    loader: ({ params }) =>
      this.catalog.searchProducts(
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
    return this.text.resultCount.replace('{count}', String(total));
  }

  protected pageStatus(p: { page: number; totalPages: number }): string {
    return this.catalogText.pageStatus
      .replace('{page}', String(p.page))
      .replace('{total}', String(p.totalPages));
  }
}
