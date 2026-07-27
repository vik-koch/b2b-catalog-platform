import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { ChevronRightIcon } from '../ui/icons/chevron-right-icon';
import { CatalogService } from './catalog.service';
import { PricePipe } from './price.pipe';
import { TileGallery } from './tile-gallery';

/** Subcategory chips shown before the "show more" toggle reveals the rest. */
const SUBS_COLLAPSED = 4;

/**
 * A category's product grid (FR-CAT-03/04): breadcrumb, a compact drill-down
 * nav of subcategories (collapsed to a few with a show-more toggle), then a
 * paginated grid of every product in this category and its descendants
 * (Pattern A). A leaf category simply has no subcategory nav.
 */
@Component({
  selector: 'app-category-grid',
  imports: [RouterLink, PricePipe, ChevronRightIcon, TileGallery],
  template: `
    <section class="pb-8 sm:pb-12">
      @if (products.error()) {
        <p class="text-stone-600">{{ text.loadError }}</p>
      } @else if (products.hasValue()) {
        @let data = products.value();
        @if (!data) {
          <p class="text-stone-600">{{ text.emptyCategories }}</p>
        } @else {
          <nav [attr.aria-label]="text.catalogRoot">
            <ol
              class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500"
            >
              <li>
                <a routerLink="/catalog" class="hover:text-accent">
                  {{ text.catalogRoot }}
                </a>
              </li>
              @for (crumb of data.category.ancestors; track crumb.slug) {
                <li aria-hidden="true" class="flex items-center">
                  <app-icon-chevron-right class="h-4 w-4 text-stone-300" />
                </li>
                <li>
                  <a
                    [routerLink]="['/catalog', crumb.slug]"
                    class="hover:text-accent"
                  >
                    {{ crumb.name }}
                  </a>
                </li>
              }
              <li aria-hidden="true" class="flex items-center">
                <app-icon-chevron-right class="h-4 w-4 text-stone-300" />
              </li>
              <li>
                <span aria-current="page" class="font-medium text-stone-700">
                  {{ data.category.name }}
                </span>
              </li>
            </ol>
          </nav>

          <h1 class="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {{ data.category.name }}
          </h1>

          @if (data.category.subcategories.length) {
            <ul class="mt-5 flex flex-wrap items-stretch gap-2.5">
              @for (
                sub of visibleSubs(data.category.subcategories);
                track sub.slug
              ) {
                <li class="flex">
                  <a
                    [routerLink]="['/catalog', sub.slug]"
                    class="flex max-w-52 items-center rounded-xl border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm font-medium text-stone-800 transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent"
                  >
                    <span class="line-clamp-2">{{ sub.name }}</span>
                  </a>
                </li>
              }
              @if (data.category.subcategories.length > SUBS_COLLAPSED) {
                <li class="flex">
                  <button
                    type="button"
                    class="rounded-xl px-4 py-2.5 text-sm font-medium text-accent hover:underline"
                    (click)="showAllSubs.set(!showAllSubs())"
                  >
                    {{ showAllSubs() ? text.showLess : text.showMore }}
                  </button>
                </li>
              }
            </ul>
          }

          @if (data.items.length) {
            <ul
              class="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            >
              @for (item of data.items; track item.slug) {
                <li class="h-full">
                  <div
                    class="group flex h-full flex-col overflow-hidden rounded-lg border border-stone-200 bg-white transition-shadow hover:shadow-md"
                  >
                    <app-tile-gallery
                      [images]="item.images"
                      [link]="['/product', item.slug]"
                      [ariaLabel]="item.name"
                    />
                    <div class="flex flex-1 flex-col p-3">
                      <a [routerLink]="['/product', item.slug]" class="block">
                        <h2
                          class="line-clamp-2 text-sm text-stone-700 group-hover:text-accent"
                          [title]="item.name"
                        >
                          {{ item.name }}
                        </h2>
                      </a>
                      <!-- Price anchored to the card bottom so it lines up
                           across tiles regardless of name length; future
                           stock / add-to-cart sit beneath it. -->
                      <p class="mt-auto pt-2 font-bold text-primary">
                        {{ item.priceMinor | price }}
                      </p>
                    </div>
                  </div>
                </li>
              }
            </ul>

            @if (data.pagination.totalPages > 1) {
              <nav
                class="mt-10 flex items-center justify-center gap-4 text-sm"
                [attr.aria-label]="text.pageStatus"
              >
                @if (data.pagination.page > 1) {
                  <a
                    [routerLink]="['/catalog', slug()]"
                    [queryParams]="{ page: data.pagination.page - 1 }"
                    class="rounded-md px-3 py-1.5 text-stone-700 hover:bg-stone-100 hover:text-accent"
                    >{{ text.prevPage }}</a
                  >
                } @else {
                  <span class="px-3 py-1.5 text-stone-300">{{
                    text.prevPage
                  }}</span>
                }
                <span class="text-stone-500">{{
                  pageStatus(data.pagination)
                }}</span>
                @if (data.pagination.page < data.pagination.totalPages) {
                  <a
                    [routerLink]="['/catalog', slug()]"
                    [queryParams]="{ page: data.pagination.page + 1 }"
                    class="rounded-md px-3 py-1.5 text-stone-700 hover:bg-stone-100 hover:text-accent"
                    >{{ text.nextPage }}</a
                  >
                } @else {
                  <span class="px-3 py-1.5 text-stone-300">{{
                    text.nextPage
                  }}</span>
                }
              </nav>
            }
          } @else {
            <p class="mt-8 text-stone-600">{{ text.emptyProducts }}</p>
          }
        }
      } @else {
        <div class="animate-pulse space-y-8" aria-hidden="true">
          <div class="h-8 w-1/3 rounded bg-stone-200"></div>
          <div
            class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
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
export class CategoryGrid {
  private catalog = inject(CatalogService);
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly skeletons = Array.from({ length: 8 }, (_, i) => i);
  protected readonly SUBS_COLLAPSED = SUBS_COLLAPSED;

  slug = input.required<string>();
  /** Bound from the `page` query param (a string); coerced and floored to 1. */
  page = input('1');
  protected currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

  protected showAllSubs = signal(false);

  protected products = resource({
    params: () => ({ slug: this.slug(), page: this.currentPage() }),
    loader: ({ params }) =>
      this.catalog.getCategoryProducts(params.slug, params.page),
  });

  protected visibleSubs<T>(subs: readonly T[]): readonly T[] {
    return this.showAllSubs() ? subs : subs.slice(0, SUBS_COLLAPSED);
  }

  protected pageStatus(p: { page: number; totalPages: number }): string {
    return this.text.pageStatus
      .replace('{page}', String(p.page))
      .replace('{total}', String(p.totalPages));
  }
}
