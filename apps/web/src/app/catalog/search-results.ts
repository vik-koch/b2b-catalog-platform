import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { stableValue } from '../core/stable-value';
import { LoadErrorView } from '../pages/load-error-view';
import { Button } from '../ui/button';
import { CatalogService } from './catalog.service';
import { ProductTile } from './product-tile';
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
  imports: [RouterLink, ProductTile, ProductSortSelect, Button, LoadErrorView],
  template: `
    <section
      class="pb-8 sm:pb-12"
      [attr.aria-busy]="results.isLoading() ? 'true' : null"
    >
      @if (results.error()) {
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
          {{ heading() }}
        </h1>
        <app-load-error-view [message]="text.loadError" />
      } @else if (shown(); as data) {
        @if (data.items.length) {
          <div
            class="flex flex-row flex-wrap justify-between items-stretch gap-3"
          >
            <div class="flex flex-col justify-between w-full md:w-auto">
              <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
                {{ heading() }}
              </h1>
              <p class="mt-2 text-sm text-subtle">
                {{ resultCount(data.pagination.total) }}
              </p>
            </div>
            <div class="mt-2 flex flex-col justify-end w-full md:w-auto">
              <app-product-sort-select
                [value]="sortKey()"
                defaultSort="relevance"
                [withRelevance]="true"
              />
            </div>
          </div>
          <ul
            class="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            @for (item of data.items; track item.slug) {
              <li class="h-full"><app-product-tile [item]="item" /></li>
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
              <span class="text-subtle">{{ pageStatus(data.pagination) }}</span>
              @if (data.pagination.page < data.pagination.totalPages) {
                <a
                  routerLink="/search"
                  [queryParams]="{
                    q: query(),
                    page: data.pagination.page + 1,
                    sort: sortParam(),
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
        } @else if (query()) {
          <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
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
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
          {{ heading() }}
        </h1>
        <div class="mt-8 animate-pulse" aria-hidden="true">
          <div
            class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
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
  private readonly catalog = inject(CatalogService);

  protected readonly text = inject(APP_TEXT).search;
  protected readonly catalogText = inject(APP_TEXT).catalog;
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
    }),
    loader: ({ params }) =>
      this.catalog.searchProducts(params.q, params.page, params.sort),
  });

  /** Held across reloads, so re-sorting swaps the grid instead of blanking it. */
  protected readonly shown = stableValue(this.results);

  /** Delayed so a quick search never flashes a skeleton. Only the first load
   * can reach it now — a reload still has the previous results on screen. */
  protected readonly showSkeleton = delayedLoading(this.results.isLoading);

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
