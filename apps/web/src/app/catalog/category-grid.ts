import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  categoryDisplayName,
  encodeAttributeParams,
  parseAttributeParams,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { LoadErrorView } from '../pages/load-error-view';
import { stableValue } from '../core/stable-value';
import { injectEditorReturnParams } from '../admin/editor-return';
import { editAwareContent } from '../admin/edit-aware-content';
import { EditActions } from '../admin/edit-actions';
import { usePageSeo } from '../core/page-seo';
import { EditModeService } from '../admin/edit-mode.service';
import { HiddenProductsSection } from '../admin/products/hidden-products-section';
import { AdminCatalogService } from '../admin/admin-catalog.service';
import { ConfirmService } from '../ui/confirm.service';
import { Button } from '../ui/button';
import { Icon } from '../ui/icons/icon';
import { NotFoundView } from '../pages/not-found-view';
import { AppliedFilters } from './applied-filters';
import { CatalogService } from './catalog.service';
import { FACET_COLUMN, FACET_LAYOUT, FacetPanel } from './facet-panel';
import { ProductLayoutService } from './product-layout';
import { ProductLayoutToggle } from './product-layout-toggle';
import { PRODUCT_ROWS, ProductRow } from './product-row';
import { PRODUCT_GRID, ProductTile } from './product-tile';
import {
  ProductSortSelect,
  resolveCategorySort,
  sortParam,
} from './product-sort-select';

/**
 * A subcategory chip's height, in px — two lines of `text-sm` plus its padding
 * and border, which is what `h-14` on the chip renders. Collapsed, the row is
 * clipped to exactly this, so the browser decides how many chips fit; the
 * number is here only so the code can ask whether anything was clipped.
 */
const SUBS_ROW_HEIGHT = 56;

/** How many chips are assumed to fit before the first measurement (SSR). */
const SUBS_ASSUMED_FIT = 4;

/**
 * A category's product grid (FR-CAT-03/04): breadcrumb, a compact drill-down
 * nav of subcategories (clipped to one row with a show-more toggle), then a
 * paginated grid of every product in this category and its descendants
 * (Pattern A). A leaf category simply has no subcategory nav.
 */
@Component({
  selector: 'app-category-grid',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    Icon,
    ProductTile,
    ProductRow,
    ProductLayoutToggle,
    ProductSortSelect,
    FacetPanel,
    AppliedFilters,
    Button,
    EditActions,
    HiddenProductsSection,
    NotFoundView,
    LoadErrorView,
  ],
  template: `
    <section
      class="@container/listing relative pb-8 sm:pb-12"
      [attr.aria-busy]="products.isLoading() ? 'true' : null"
    >
      @if (products.error()) {
        <app-load-error-view [message]="text.loadError" />
      } @else if (ready()) {
        @let data = shown();
        @if (!data) {
          <app-not-found-view
            [body]="text.categoryNotFound"
            backLink="/catalog"
            [backLabel]="text.backToCatalog"
          />
        } @else {
          <!-- Creating a subcategory or a product happens from here rather
                than from a placeholder among the content: this category is
                already the parent either way, and the cluster keeps the
                gesture in the one place every page puts it. -->
          @if (editControls(); as editText) {
            <app-edit-actions
              [filtersLink]="[
                '/admin/categories',
                data.category.slug,
                'filters',
              ]"
              [filtersParams]="editorFrom()"
              [filtersLabel]="editText.editFilters"
              [editLink]="['/admin/categories', data.category.slug, 'edit']"
              [editParams]="editorFrom()"
              [editLabel]="editText.editCategory"
              [addCategoryLink]="['/admin/categories/new']"
              [addCategoryParams]="{
                parent: data.category.slug,
                from: editorFrom().from,
              }"
              [addCategoryLabel]="editText.addCategory"
              [addProductLink]="['/admin/products/new']"
              [addProductParams]="{
                category: data.category.slug,
                from: editorFrom().from,
              }"
              [addProductLabel]="editText.addProduct"
            />
          }
          <!-- The category's controls share the breadcrumb's row rather than
               being pinned to the section corner: pinned, they landed on top of
               the sort control that sits at the right of the row below. -->
          <div class="flex items-start justify-between gap-4">
            <nav [attr.aria-label]="text.catalogRoot">
              <ol
                class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-subtle"
              >
                <li>
                  <a routerLink="/catalog" class="hover:text-accent">
                    {{ text.catalogRoot }}
                  </a>
                </li>
                @for (crumb of data.category.ancestors; track crumb.slug) {
                  <li aria-hidden="true" class="flex items-center">
                    <app-icon
                      name="chevron-right"
                      class="h-4 w-4 text-stone-300"
                    />
                  </li>
                  <li>
                    <!-- Upward too: a wider scope still offers every value the
                         narrower one did. -->
                    <a
                      [routerLink]="['/catalog', crumb.slug]"
                      [queryParams]="{ sort: sortParam(), attr: attrParam() }"
                      class="hover:text-accent"
                    >
                      {{ displayName(crumb) }}
                    </a>
                  </li>
                }
                <li aria-hidden="true" class="flex items-center">
                  <app-icon
                    name="chevron-right"
                    class="h-4 w-4 text-stone-300"
                  />
                </li>
                <li>
                  <span aria-current="page" class="font-medium text-stone-700">
                    {{ displayName(data.category) }}
                  </span>
                </li>
              </ol>
            </nav>
          </div>

          <div
            class="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
          >
            <h1 class="text-2xl font-medium tracking-tight sm:text-3xl">
              {{ data.category.name }}
            </h1>

            <!-- The chips share the title's row rather than getting one of
                 their own: a row that appears with the first selection would
                 push the grid down as it was ticked. -->
            <app-applied-filters
              class="hidden min-w-0 flex-1 sm:block"
              [facets]="data.facets"
            />

            <!-- Right-aligned above the grid rather than beside the title: the
                title row belongs to the breadcrumb and, in edit mode, to the
                category controls pinned top-right. -->
            @if (data.items.length) {
              <div class="flex items-end justify-end gap-3">
                <app-product-sort-select
                  [value]="sortKey()"
                  defaultSort="name"
                />
                <app-product-layout-toggle />
              </div>
            }
          </div>

          @if (data.category.subcategories.length) {
            <!-- The chips are clipped to one row rather than cut to a count:
                 how many fit is a question about the width the visitor has,
                 which only the browser can answer. The toggle sits beside the
                 list, outside what is clipped, so it stays on screen. -->
            <div class="mt-5 flex items-start gap-3">
              <ul #subsList [class]="subsListClass()">
                @for (sub of data.category.subcategories; track sub.slug) {
                  <li class="flex">
                    <!-- The selection travels down with the visitor: the
                         values are the catalogue's, not this category's, so
                         narrowing the scope is no reason to forget them. It may
                         leave the subcategory with no matches — the chips and
                         the panel are on screen there to say so and undo it.
                         The sort goes with it: it is the same kind of stated
                         preference, and every listing offers the same orders. -->
                    <a
                      [routerLink]="['/catalog', sub.slug]"
                      [queryParams]="{ sort: sortParam(), attr: attrParam() }"
                      class="flex h-14 max-w-52 min-w-28 items-center justify-center rounded-xl border border-border bg-stone-100 px-4 text-sm font-medium text-stone-800 transition-colors hover:border-accent hover:text-accent"
                    >
                      <span class="line-clamp-2">{{ displayName(sub) }}</span>
                    </a>
                  </li>
                }
              </ul>
              @if (subsToggle(data.category.subcategories.length)) {
                <div class="flex shrink-0 items-stretch gap-3">
                  <button
                    type="button"
                    class="h-14 rounded-xl px-3 text-sm font-medium text-accent hover:underline"
                    (click)="showAllSubs.set(!showAllSubs())"
                  >
                    {{ showAllSubs() ? text.showLess : text.showMore }}
                  </button>
                </div>
              }
            </div>
          }

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
              @if (data.items.length) {
                <!-- The same products, drawn the way the visitor last asked
                     for: fitted cards, or full-width lines. -->
                <ul [class]="list()">
                  <!-- One cluster, placed twice: a card takes it in its own
                       corner, a line in the corner of its photo, and the two
                       must be the same control. -->
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
                    [attr.aria-label]="text.pageStatus"
                  >
                    @if (data.pagination.page > 1) {
                      <a
                        [routerLink]="['/catalog', slug()]"
                        [queryParams]="{
                          page: data.pagination.page - 1,
                          sort: sortParam(),
                          attr: attrParam(),
                        }"
                        appButton
                        variant="ghost"
                        size="sm"
                        >{{ text.prevPage }}</a
                      >
                    } @else {
                      <span class="px-3 py-1.5 text-stone-300">{{
                        text.prevPage
                      }}</span>
                    }
                    <span class="text-subtle">{{
                      pageStatus(data.pagination)
                    }}</span>
                    @if (data.pagination.page < data.pagination.totalPages) {
                      <a
                        [routerLink]="['/catalog', slug()]"
                        [queryParams]="{
                          page: data.pagination.page + 1,
                          sort: sortParam(),
                          attr: attrParam(),
                        }"
                        appButton
                        variant="ghost"
                        size="sm"
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
                <p class="text-muted">
                  {{
                    hasSelection() ? filterText.noMatches : text.emptyProducts
                  }}
                </p>
              }
            </div>
          </div>
        }
      } @else if (showSkeleton()) {
        <div class="animate-pulse space-y-8" aria-hidden="true">
          <!-- The breadcrumb is part of the loaded page, so it is part of the
               placeholder too — otherwise the title jumps down a row when the
               real content arrives. -->
          <div class="space-y-3">
            <div class="h-4 w-1/2 rounded bg-stone-200 sm:w-1/3"></div>
            <div class="h-8 w-1/3 rounded bg-stone-200"></div>
          </div>
          <div [class]="productGrid">
            @for (i of skeletons; track i) {
              <div class="aspect-square rounded-lg bg-stone-200"></div>
            }
          </div>
        </div>
      }

      <!-- Outside the branch above on purpose: its fetch is what the grid waits
           for before drawing the edit affordances, so it must not in turn wait
           for the grid. The slug comes from the route, which is known at once. -->
      @defer (when editMode.enabled()) {
        @if (editMode.enabled()) {
          <app-hidden-products-section
            [categorySlug]="slug()"
            [reloadToken]="deletedReload()"
            (loaded)="deletedReady.set(true)"
            (restored)="onProductRestored()"
          />
        }
      }
    </section>
  `,
})
export class CategoryGrid {
  protected readonly productGrid = PRODUCT_GRID;
  protected readonly facetLayout = FACET_LAYOUT;
  protected readonly facetColumn = FACET_COLUMN;
  private readonly productLayout = inject(ProductLayoutService);
  /** Cards or lines — the visitor's standing choice, shared with search. */
  protected readonly cards = computed(
    () => this.productLayout.layout() === 'grid',
  );
  /**
   * Which listing this is: lines, or cards. The filter panel is a column of
   * the card grid rather than something taken off it, so a listing with
   * nothing to filter by lays its cards out exactly like one that has.
   */
  protected list(): string {
    return this.cards() ? PRODUCT_GRID : PRODUCT_ROWS;
  }

  private catalog = inject(CatalogService);
  private readonly admin = inject(AdminCatalogService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly editMode = inject(EditModeService);
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly filterText = this.text.filters;
  protected readonly editorFrom = injectEditorReturnParams();
  protected readonly skeletons = Array.from({ length: 8 }, (_, i) => i);
  /** Breadcrumb crumbs and subcategory chips are read in the context of their
   * parent, so they may use the short name; the page heading stays the full
   * one, which is also what SEO and the delete confirmation use. */
  protected readonly displayName = categoryDisplayName;

  slug = input.required<string>();
  /** Bound from the `page` query param (a string); coerced and floored to 1. */
  page = input('1');
  protected currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  /** Bound from the `sort` query param; an unknown key falls back to the
   * default rather than being sent on to the API (FR-SEARCH-04). */
  sort = input('');
  protected readonly sortKey = computed(() => resolveCategorySort(this.sort()));
  /** The sort as pagination links should carry it — absent when default. */
  protected readonly sortParam = computed(() =>
    sortParam(this.sortKey(), 'name'),
  );

  /**
   * Bound from the repeated `attr` query parameter (FR-ATTR-07) — a bare string
   * when one value is ticked, an array beyond that, which is why it is read
   * through the shared codec rather than used as it arrives.
   */
  attr = input<string | readonly string[] | undefined>(undefined);
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

  protected showAllSubs = signal(false);
  private readonly subsList = viewChild<ElementRef<HTMLElement>>('subsList');
  /** Whether the chip list has more than the one row it is clipped to. Null
   * until it has been measured — on the server and before the first layout the
   * chip count stands in for it, so a long list still offers the toggle in the
   * HTML the crawler and the first paint get. */
  private readonly subsOverflow = signal<boolean | null>(null);
  protected readonly subsListClass = computed(() =>
    this.showAllSubs()
      ? 'flex min-w-0 flex-1 flex-wrap items-stretch gap-3'
      : 'flex min-w-0 flex-1 flex-wrap items-stretch gap-3 max-h-14 overflow-hidden',
  );
  /** The product whose delete confirmation is open, if any. */
  /** The category (this page's own) whose delete confirmation is open. */
  /** Bumped to re-fetch the edit-mode "Deleted" overlay after a delete/restore. */
  protected readonly deletedReload = signal(0);
  /** True once the deleted-products overlay has loaded for the current edit-mode
   * session; re-armed whenever edit mode turns off. */
  protected readonly deletedReady = signal(false);

  protected products = resource({
    params: () => ({
      slug: this.slug(),
      page: this.currentPage(),
      sort: this.sortKey(),
      attr: this.attrParams(),
    }),
    loader: ({ params }) =>
      this.catalog.getCategoryProducts(
        params.slug,
        params.page,
        params.sort,
        params.attr,
      ),
  });

  /** Held across reloads, so re-sorting swaps the grid instead of blanking it. */
  protected readonly shown = stableValue(this.products);

  /**
   * The grid, its ＋ tiles and the per-item controls all appear together, once
   * the products, the visitor's role and — in edit mode — the "Deleted" overlay
   * are known (see editAwareContent). A missing category is a loaded `null`, so
   * emptiness is not the test for having an answer.
   *
   * The skeleton is reachable only on a first load; a reload still has the
   * previous grid on screen.
   */
  private readonly content = editAwareContent({
    ready: computed(() => this.shown() !== undefined),
    section: 'editMode',
    alsoWaitFor: this.deletedReady,
  });
  protected readonly ready = this.content.ready;
  protected readonly editControls = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;

  constructor() {
    usePageSeo({
      // Guarded: `value()` throws on an errored resource.
      name: () =>
        this.products.hasValue()
          ? this.products.value()?.category.name
          : undefined,
    });
    // Re-arm the gate each time edit mode turns off, so re-entering waits for a
    // fresh overlay load rather than showing the controls from the last session.
    effect(() => {
      if (!this.editMode.enabled()) this.deletedReady.set(false);
    });

    // How many chips fit is a width question, so it is re-asked whenever the
    // list is resized — and when the list itself arrives or goes away.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.measureSubs());
      effect((onCleanup) => {
        const el = this.subsList()?.nativeElement;
        if (!el) {
          this.subsOverflow.set(null);
          return;
        }
        observer.observe(el);
        onCleanup(() => observer.unobserve(el));
      });
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }

  /** A product was restored from the overlay — it returns to the live grid. */
  protected onProductRestored(): void {
    this.products.reload();
    this.deletedReload.update((v) => v + 1);
  }

  /** Whether to offer the show-more toggle for `count` chips. */
  protected subsToggle(count: number): boolean {
    return this.subsOverflow() ?? count > SUBS_ASSUMED_FIT;
  }

  private measureSubs(): void {
    const el = this.subsList()?.nativeElement;
    // scrollHeight is the unclipped height in both states, so one test answers
    // for the collapsed list and the expanded one alike.
    if (el) this.subsOverflow.set(el.scrollHeight > SUBS_ROW_HEIGHT + 1);
  }

  protected pageStatus(p: { page: number; totalPages: number }): string {
    return this.text.pageStatus
      .replace('{page}', String(p.page))
      .replace('{total}', String(p.totalPages));
  }
}
