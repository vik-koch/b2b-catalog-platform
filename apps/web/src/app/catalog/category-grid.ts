import {
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { adminText } from '../config/admin-text';
import { usePageSeo } from '../core/page-seo';
import { EditModeService } from '../admin/edit-mode.service';
import { CategoryDeleteDialog } from '../admin/category-delete-dialog';
import { ProductDeleteDialog } from '../admin/product-delete-dialog';
import { DeletedProductsSection } from '../admin/deleted-products-section';
import { ChevronRightIcon } from '../ui/icons/chevron-right-icon';
import { IconButton } from '../ui/icon-button';
import { LucideIcon } from '../ui/icons/lucide-icon';
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
  imports: [
    RouterLink,
    PricePipe,
    ChevronRightIcon,
    TileGallery,
    LucideIcon,
    IconButton,
    ProductDeleteDialog,
    CategoryDeleteDialog,
    DeletedProductsSection,
  ],
  template: `
    <section class="relative pb-8 sm:pb-12">
      @if (products.error()) {
        <p class="text-stone-600">{{ text.loadError }}</p>
      } @else if (products.hasValue()) {
        @let data = products.value();
        @if (!data) {
          <p class="text-stone-600">{{ text.emptyCategories }}</p>
        } @else {
          @if (editControls(); as editText) {
            <div class="absolute top-0 right-0 z-10 flex gap-2">
              <a
                appIconButton
                [routerLink]="['/admin/categories', data.category.slug, 'edit']"
                [attr.aria-label]="editText.editCategory"
                [attr.title]="editText.editCategory"
              >
                <app-lucide-icon name="pencil" class="h-5 w-5" />
              </a>
              <button
                appIconButton
                variant="danger"
                type="button"
                [attr.aria-label]="editText.deleteCategory"
                [attr.title]="editText.deleteCategory"
                (click)="
                  deletingCategory.set({
                    slug: data.category.slug,
                    name: data.category.name,
                  })
                "
              >
                <app-lucide-icon name="trash-2" class="h-5 w-5" />
              </button>
            </div>
          }
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

          @if (data.items.length || editMode.enabled()) {
            <ul
              class="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            >
              @if (editControls(); as editText) {
                <li class="h-full">
                  <a
                    [routerLink]="['/admin/products/new']"
                    [queryParams]="{ category: data.category.slug }"
                    class="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 text-stone-500 transition-colors hover:border-primary hover:text-primary"
                  >
                    <app-lucide-icon name="plus" class="h-8 w-8" />
                    <span class="text-sm font-medium">{{
                      editText.addProduct
                    }}</span>
                  </a>
                </li>
              }
              @for (item of data.items; track item.slug) {
                <li class="h-full">
                  <div
                    class="group relative flex h-full flex-col overflow-hidden rounded-lg border border-stone-200 bg-white transition-shadow hover:shadow-md"
                  >
                    @if (editControls(); as editText) {
                      <div class="absolute top-2 right-2 z-10 flex gap-1.5">
                        <a
                          appIconButton
                          [routerLink]="['/admin/products', item.slug, 'edit']"
                          [attr.aria-label]="editText.editProduct"
                        >
                          <app-lucide-icon name="pencil" class="h-4 w-4" />
                        </a>
                        <button
                          appIconButton
                          variant="danger"
                          type="button"
                          [attr.aria-label]="editText.deleteProduct"
                          (click)="deletingProduct.set(item)"
                        >
                          <app-lucide-icon name="trash-2" class="h-4 w-4" />
                        </button>
                      </div>
                    }
                    <app-tile-gallery
                      [images]="item.images"
                      [link]="['/product', item.slug]"
                      [productName]="item.name"
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

          @defer (when editMode.enabled()) {
            @if (editMode.enabled()) {
              <app-deleted-products-section
                [categorySlug]="data.category.slug"
                [reloadToken]="deletedReload()"
                (loaded)="deletedReady.set(true)"
                (restored)="onProductRestored()"
              />
            }
          }

          @defer (when deletingProduct()) {
            @if (deletingProduct(); as target) {
              <app-product-delete-dialog
                [slug]="target.slug"
                [name]="target.name"
                (deleted)="onProductDeleted()"
                (cancelled)="deletingProduct.set(null)"
              />
            }
          }

          @defer (when deletingCategory()) {
            @if (deletingCategory(); as target) {
              <app-category-delete-dialog
                [slug]="target.slug"
                [name]="target.name"
                (deleted)="
                  onCategoryDeleted(data.category.ancestors.at(-1)?.slug)
                "
                (cancelled)="deletingCategory.set(null)"
              />
            }
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
  private readonly router = inject(Router);
  protected readonly editMode = inject(EditModeService);
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
  /** The product whose delete confirmation is open, if any. */
  protected readonly deletingProduct = signal<{
    slug: string;
    name: string;
  } | null>(null);
  /** The category (this page's own) whose delete confirmation is open. */
  protected readonly deletingCategory = signal<{
    slug: string;
    name: string;
  } | null>(null);
  /** Bumped to re-fetch the edit-mode "Deleted" overlay after a delete/restore. */
  protected readonly deletedReload = signal(0);
  /** True once the deleted-products overlay has loaded for the current edit-mode
   * session; re-armed whenever edit mode turns off. */
  protected readonly deletedReady = signal(false);

  /** Gate for the in-place edit affordances (＋ tile, per-item and category
   * controls). Held back until the "Deleted" overlay has loaded so entering edit
   * mode reveals everything at once instead of flashing the controls first.
   * Also carries the edit-mode wording, which is fetched rather than injected:
   * this component renders for anonymous visitors too, who never load it. */
  protected readonly editControls = computed(() =>
    this.editMode.enabled() && this.deletedReady()
      ? (adminText()?.editMode ?? null)
      : null,
  );

  protected products = resource({
    params: () => ({ slug: this.slug(), page: this.currentPage() }),
    loader: ({ params }) =>
      this.catalog.getCategoryProducts(params.slug, params.page),
  });

  constructor() {
    usePageSeo({ name: () => this.products.value()?.category.name });
    // Re-arm the gate each time edit mode turns off, so re-entering waits for a
    // fresh overlay load rather than showing the controls from the last session.
    effect(() => {
      if (!this.editMode.enabled()) this.deletedReady.set(false);
    });
  }

  protected onProductDeleted(): void {
    this.deletingProduct.set(null);
    this.products.reload();
    // The just-deleted product now belongs in the "Deleted" overlay.
    this.deletedReload.update((v) => v + 1);
  }

  /** A product was restored from the overlay — it returns to the live grid. */
  protected onProductRestored(): void {
    this.products.reload();
    this.deletedReload.update((v) => v + 1);
  }

  /** This category is gone — leave for its parent (or the catalog root). */
  protected onCategoryDeleted(parentSlug: string | undefined): void {
    this.deletingCategory.set(null);
    void this.router.navigate(
      parentSlug ? ['/catalog', parentSlug] : ['/catalog'],
    );
  }

  protected visibleSubs<T>(subs: readonly T[]): readonly T[] {
    return this.showAllSubs() ? subs : subs.slice(0, SUBS_COLLAPSED);
  }

  protected pageStatus(p: { page: number; totalPages: number }): string {
    return this.text.pageStatus
      .replace('{page}', String(p.page))
      .replace('{total}', String(p.totalPages));
  }
}
