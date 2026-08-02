import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { LoadErrorView } from '../pages/load-error-view';
import { Button } from '../ui/button';
import { CatalogService } from './catalog.service';
import { ProductTile } from './product-tile';

/**
 * Search results — the same product tiles the category grid
 * renders, in relevance order, with no category chrome around them.
 */
@Component({
  selector: 'app-search-results',
  imports: [RouterLink, ProductTile, Button, LoadErrorView],
  template: `
    <section class="pb-8 sm:pb-12">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
        {{ heading() }}
      </h1>

      @if (results.error()) {
        <app-load-error-view [message]="text.loadError" />
      } @else if (results.hasValue()) {
        @let data = results.value();
        @if (data.items.length) {
          <p class="mt-2 text-subtle">
            {{ resultCount(data.pagination.total) }}
          </p>
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
                  [queryParams]="{ q: query(), page: data.pagination.page - 1 }"
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
                  [queryParams]="{ q: query(), page: data.pagination.page + 1 }"
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
          <p class="mt-8 text-muted">
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

  protected readonly heading = computed(() =>
    this.query()
      ? this.text.resultsTitle.replace('{query}', this.query())
      : this.text.submit,
  );

  protected readonly results = resource({
    params: () => ({ q: this.query(), page: this.currentPage() }),
    loader: ({ params }) => this.catalog.searchProducts(params.q, params.page),
  });

  /** Delayed so a quick search never flashes a skeleton. */
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
