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
import { Params, Router, RouterLink } from '@angular/router';
import {
  CategoryCrumb,
  categoryDisplayName,
  encodeAttributeParams,
  Facet,
  fillText,
  parseAttributeParams,
  ProductListItem,
  ProductSort,
  SubcategoryLink,
} from '@b2b-catalog-platform/shared';
import { EditActions } from '../admin/edit-actions';
import { editAwareContent } from '../admin/edit-aware-content';
import { EditModeService } from '../admin/edit-mode.service';
import { ProductCreateService } from '../admin/ownership/product-create.service';
import { injectEditorReturnParams } from '../admin/editor-return';
import { HiddenProductsSection } from '../admin/products/hidden-products-section';
import { APP_TEXT } from '../config/app-text';
import { usePageSeo } from '../core/page-seo';
import { stableValue } from '../core/stable-value';
import { LoadErrorView } from '../pages/load-error-view';
import { NotFoundView } from '../pages/not-found-view';
import { Button } from '../ui/button';
import { ConfirmService } from '../ui/confirm.service';
import { disclosureState } from '../ui/disclosure-state';
import { ShowMoreToggle } from '../ui/show-more-toggle';
import { Icon } from '../ui/icons/icon';
import { AppliedFilters } from './applied-filters';
import { CatalogService } from './catalog.service';
import { CategoryChip } from './category-chip';
import { CATEGORY_GRID } from './category-index';
import {
  FACET_COLUMN,
  FACET_LAYOUT,
  FACET_SIBLING,
  FACET_SIBLING_ALONE,
  FacetPanel,
} from './facet-panel';
import { anyStatus } from './product-status-line';
import { ProductLayoutService } from './product-layout';
import { ProductLayoutToggle } from './product-layout-toggle';
import { PRODUCT_ROWS, ProductRow } from './product-row';
import {
  ProductSortSelect,
  resolveCategorySort,
  sortParam,
} from './product-sort-select';
import { PRODUCT_GRID, ProductTile } from './product-tile';

/**
 * What the collapsed chip list clips to, in px: four `h-16` chip rows, the
 * `gap-3`s between them and the 4px the list is inset by (see SUBS_LIST) —
 * as many as the main page names under a category.
 * Collapsed, the list is clipped to exactly this, so the browser decides how
 * many chips fit; the number is here only so the code can ask whether anything
 * was clipped. It is a phone's figure — the clip is lifted from `sm` up, where
 * the chips are a grid and every one of them is shown.
 */
const SUBS_CLIP_HEIGHT = 300;

/** How many chips are assumed to fit before the first measurement (SSR) — the
 * four a phone's single column holds inside the clip. */
const SUBS_ASSUMED_FIT = 4;

/**
 * The chips stand in the same grid the index puts them in (CATEGORY_GRID) —
 * fitted 15rem tracks, one column on a phone — rather than in a row that
 * fitted each chip to its name. A category is the same object here as on the
 * index, so it is the same width here too, and the chips line up with the
 * product cards under them instead of with each other.
 *
 * `-m-1 p-1` grows the box the clip is applied to by 4px on every side while
 * leaving the chips exactly where they were: the clip is `overflow-hidden`,
 * and against a flush edge it cut the focus outline off the chips on the rim.
 */
const SUBS_LIST = `${CATEGORY_GRID} -m-1 p-1`;

/**
 * Clipped to four chip rows on a phone, open from `sm` up — enough to read the
 * shape of the list, where one row only ever showed its beginning. A
 * class rather than a branch: the server has no width to test, and the same
 * HTML has to be right on both sides of it.
 *
 * Opening and closing move rather than jump, so the products below are seen to
 * be pushed down rather than found somewhere else. Both states are therefore a
 * length: the open one is the measured height in a custom property, because
 * `none` is not a length and a transition between it and the cap — in either
 * direction — does not run. The slack on top of the measurement costs no
 * height (a cap is not a size) and keeps the cap clear of the content it
 * stands over; the fallback before the first measurement is generous for the
 * same reason. The transition is armed only while a toggle's own movement
 * runs, so a resize past `sm` lifts the clip with nothing to animate.
 */
const SUBS_CLIP = 'overflow-hidden sm:max-h-none sm:overflow-visible';
const SUBS_CLIPPED = 'max-h-75';
const SUBS_OPEN = 'max-h-[calc(var(--subs-full,100rem)+0.5rem)]';
const SUBS_MOVE = 'transition-[max-height] duration-200 ease-out';

const SUBS_TOGGLE = 'mt-2 sm:hidden';

/**
 * What either listing hands the template: a category's, or — with `category`
 * null — the whole catalogue's, whose drill-down nav is the top level.
 */
interface Listing {
  category: {
    slug: string;
    name: string;
    shortName: string | null;
    ancestors: CategoryCrumb[];
  } | null;
  subcategories: SubcategoryLink[];
  items: ProductListItem[];
  pagination: { page: number; totalPages: number; total: number };
  facets: Facet[];
}

/**
 * A category's product grid (FR-CAT-03/04): breadcrumb, a drill-down nav of
 * subcategory chips (all of them, clipped to two rows with a show-more toggle
 * on a phone — see SUBS_LIST), then a paginated grid of every product in this
 * category and its descendants (Pattern A). A leaf category simply has no
 * subcategory nav.
 *
 * Without a slug it is the catalogue index (FR-CAT-02): the same listing one
 * level up — every product, the top-level categories as its chips.
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
    CategoryChip,
    Button,
    ShowMoreToggle,
    EditActions,
    HiddenProductsSection,
    NotFoundView,
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
      class="@container/listing relative"
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
            @if (data.category; as category) {
              <app-edit-actions
                [filtersLink]="['/admin/categories', category.slug, 'filters']"
                [filtersParams]="editorFrom()"
                [filtersLabel]="editText.editFilters"
                [editLink]="['/admin/categories', category.slug, 'edit']"
                [editParams]="editorFrom()"
                [editLabel]="editText.editCategory"
                [addCategoryLink]="['/admin/categories/new']"
                [addCategoryParams]="{
                  parent: category.slug,
                  from: editorFrom().from,
                }"
                [addCategoryLabel]="editText.addCategory"
                [addProductLabel]="editText.addProduct"
                (addProduct)="
                  addProduct({
                    category: category.slug,
                    from: editorFrom().from,
                  })
                "
              />
            } @else {
              <!-- The catalogue's own: its filter panel, the category list,
                   and a top-level category or a product with no category
                   chosen yet. -->
              <app-edit-actions
                [filtersLink]="['/admin/catalog/filters']"
                [filtersParams]="editorFrom()"
                [filtersLabel]="editText.editFilters"
                [editLink]="['/admin/categories']"
                [editLabel]="editText.editCategories"
                [addCategoryLink]="['/admin/categories/new']"
                [addCategoryParams]="editorFrom()"
                [addCategoryLabel]="editText.addCategory"
                [addProductLabel]="editText.addProduct"
                (addProduct)="addProduct({ from: editorFrom().from })"
              />
            }
          }
          <!-- The category's controls share the breadcrumb's row rather than
               being pinned to the section corner: pinned, they landed on top of
               the sort control that sits at the right of the row below. -->
          <!-- On the catalogue itself too, as a trail of one: the heading then
               sits where a category's does, and nothing moves on the way down. -->
          <div class="flex items-start justify-between gap-4">
            <nav [attr.aria-label]="text.catalogRoot">
              <!-- Inline flow, not a flex row. Flexed, a crumb is one
                   unbreakable box: a category whose name does not fit the line
                   drops whole onto the next one and leaves the gap it came
                   from, which on a wide screen is half a line of nothing. As
                   text, a long name wraps where it runs out of room and the
                   trail stays a trail. -->
              <ol role="list" class="text-sm text-subtle">
                @if (data.category; as category) {
                  <li class="inline">
                    <a routerLink="/catalog" class="hover:text-accent">
                      {{ text.catalogRoot }}
                    </a>
                  </li>
                  @for (crumb of category.ancestors; track crumb.slug) {
                    <li aria-hidden="true" class="inline">
                      <app-icon
                        name="chevron-right"
                        class="mx-1 h-4 w-4 align-middle text-stone-300"
                      />
                    </li>
                    <li class="inline">
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
                  <li aria-hidden="true" class="inline">
                    <app-icon
                      name="chevron-right"
                      class="mx-1 h-4 w-4 align-middle text-stone-300"
                    />
                  </li>
                  <li class="inline">
                    <span
                      aria-current="page"
                      class="font-medium text-stone-700"
                    >
                      {{ displayName(category) }}
                    </span>
                  </li>
                } @else {
                  <li class="inline">
                    <span
                      aria-current="page"
                      class="font-medium text-stone-700"
                    >
                      {{ text.catalogRoot }}
                    </span>
                  </li>
                }
              </ol>
            </nav>
          </div>

          <div
            class="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
          >
            <h1
              class="text-2xl font-medium tracking-tight @min-[38rem]/listing:text-3xl"
            >
              {{ data.category?.name ?? text.catalogRoot }}
            </h1>

            <!-- The chips share the title's row rather than getting one of
                 their own: a row that appears with the first selection would
                 push the grid down as it was ticked. -->
            <app-applied-filters
              class="hidden min-w-0 flex-1 @min-[38rem]/listing:block"
              [facets]="data.facets"
            />
          </div>

          @if (data.subcategories.length) {
            <!-- Every subcategory, over as many rows as it takes: the chips are
                 the way down from here, and a wide screen has no reason to hide
                 half of them behind a toggle. Only a phone, where the same list
                 is a column that buries the products, still clips a category's
                 to four rows — and there the toggle sits under the chips, where
                 the gallery and the description put theirs. -->
            <div class="mt-6">
              <ul
                #subsList
                [id]="subsListId"
                [class]="subsListClass()"
                [style.--subs-full]="subsFullHeight()"
              >
                @for (sub of data.subcategories; track sub.slug) {
                  <li class="relative">
                    <!-- The same cluster the index puts on its chips: a
                         subcategory is as editable from the listing it is
                         reached through as from the catalogue's own index. -->
                    @if (editControls(); as editText) {
                      <app-edit-actions
                        variant="tile"
                        [editLink]="['/admin/categories', sub.slug, 'edit']"
                        [editParams]="editorFrom()"
                        [editLabel]="editText.editCategory"
                      />
                    }
                    <!-- The selection travels down with the visitor: the
                         values are the catalogue's, not this category's, so
                         narrowing the scope is no reason to forget them. It may
                         leave the subcategory with no matches — the chips and
                         the panel are on screen there to say so and undo it.
                         The sort goes with it: it is the same kind of stated
                         preference, and every listing offers the same orders. -->
                    <app-category-chip
                      [category]="sub"
                      [queryParams]="{ sort: sortParam(), attr: attrParam() }"
                    />
                  </li>
                }
              </ul>
              @if (subsToggle(data.subcategories.length)) {
                <app-show-more-toggle
                  [class]="subsToggleClass"
                  [expanded]="showAllSubs()"
                  [moreLabel]="text.showMore"
                  [lessLabel]="text.showLess"
                  [controls]="subsListId"
                  (toggled)="subsDisclosure.toggle()"
                />
              }
            </div>
          }

          <!-- Filters left, listing right, from the width where the panel
               costs the listing neither a column nor an arrangement (see
               FACET_LAYOUT); a disclosure above it below that. -->
          <div class="mt-6" [class]="facetLayout">
            @if (data.facets.length) {
              <aside [class]="facetColumn">
                <app-facet-panel
                  [facets]="data.facets"
                  [sort]="sortKey()"
                  defaultSort="name"
                />
              </aside>
            }
            <div [class]="data.facets.length ? listingColumn : listingAlone">
              @if (data.items.length) {
                <!-- What the listing is showing, and the two ways of asking
                     for it differently. The row is the height of the filter
                     column's own heading and sits over the same gap, so the
                     first card starts on the line the first facet does. -->
                <div class="mb-4 flex h-8 items-center justify-between gap-4">
                  <p class="text-sm text-subtle">
                    {{ productCount(data.pagination.total) }}
                  </p>
                  <div class="flex items-center gap-3">
                    <!-- The sort keeps this row only while there is a filter
                         column beside the grid to hold the other copy of it;
                         below that it moves inside the filter disclosure, so a
                         narrow screen has one place to arrange the listing
                         rather than two. The shape control has no second copy
                         and stays here at every width, down to the one where
                         both shapes are the same shape and it hides itself. -->
                    <app-product-sort-select
                      [class]="data.facets.length ? headerSortAt : ''"
                      [value]="sortKey()"
                      defaultSort="name"
                    />
                    <app-product-layout-toggle />
                  </div>
                </div>
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
                  <!-- Asked once for the page: a listing where one product states
                       a stock leaves the line for all of them, so the names
                       sit level. -->
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

                @if (data.pagination.totalPages > 1) {
                  <nav
                    class="mt-8 flex items-center justify-center gap-4 text-sm"
                    [attr.aria-label]="text.pageStatus"
                  >
                    @if (data.pagination.page > 1) {
                      <a
                        [routerLink]="listingLink()"
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
                        [routerLink]="listingLink()"
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
                    hasSelection()
                      ? filterText.noMatches
                      : data.category
                        ? text.emptyProducts
                        : text.emptyCategories
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
            <div
              class="h-4 w-1/2 rounded bg-stone-200 @min-[38rem]/listing:w-1/3"
            ></div>
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
        @if (editMode.enabled() && slug(); as categorySlug) {
          <app-hidden-products-section
            [categorySlug]="categorySlug"
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
  /** Whether this page of products states any stock at all — see the badge. */
  protected readonly anyStatus = anyStatus;

  protected readonly productGrid = PRODUCT_GRID;

  /**
   * The sort above the grid is hidden wherever the filter panel is a disclosure
   * that carries a copy of it — but only where there *is* a panel: a listing
   * with no attributes to filter by has no disclosure to hold the control, and
   * losing it would leave a narrow screen with no way to reorder at all.
   */
  protected readonly headerSortAt = 'hidden @min-[63.75rem]/listing:block';
  protected readonly facetLayout = FACET_LAYOUT;
  protected readonly facetColumn = FACET_COLUMN;
  protected readonly listingColumn = FACET_SIBLING;
  protected readonly listingAlone = FACET_SIBLING_ALONE;
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
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly editMode = inject(EditModeService);
  private readonly productCreate = inject(ProductCreateService);
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly filterText = this.text.filters;
  protected readonly editorFrom = injectEditorReturnParams();
  protected readonly skeletons = Array.from({ length: 8 }, (_, i) => i);
  /** Breadcrumb crumbs are read in the context of their parent, so they may
   * use the short name; the page heading stays the full one, which is also what
   * SEO and the delete confirmation use. The subcategory chips make the same
   * choice for themselves (see CategoryChip). */
  protected readonly displayName = categoryDisplayName;

  /** Absent on `/catalog` itself — the whole-catalogue listing. */
  slug = input<string>();
  /** Where pagination links point: this listing, with new query params. */
  protected readonly listingLink = computed(() => {
    const slug = this.slug();
    return slug ? ['/catalog', slug] : ['/catalog'];
  });
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

  /** Armed only while the toggle's own movement runs, so a resize past `sm`
   * changes the clip with no transition on the element (see disclosureState). */
  protected readonly subsDisclosure = disclosureState(200);
  protected readonly showAllSubs = this.subsDisclosure.open;
  protected readonly subsListId = 'subcategories';
  private readonly subsList = viewChild<ElementRef<HTMLElement>>('subsList');
  /** Whether the chip list has more than the one row it is clipped to. Null
   * until it has been measured — on the server and before the first layout the
   * chip count stands in for it, so a long list still offers the toggle in the
   * HTML the crawler and the first paint get. */
  private readonly subsOverflow = signal<boolean | null>(null);
  /** The unclipped height of the chip list, as the open state's `max-height`.
   * Null until measured — see SUBS_OPEN. */
  protected readonly subsFullHeight = signal<string | null>(null);
  protected readonly subsListClass = computed(() => {
    // The catalogue's chips are the top level, which a phone shows whole: a
    // dozen groupings is the page's own content, not a list to page through.
    if (!this.slug()) return SUBS_LIST;
    const move = this.subsDisclosure.animated() ? ` ${SUBS_MOVE}` : '';
    const cap = this.showAllSubs() ? SUBS_OPEN : SUBS_CLIPPED;
    return `${SUBS_LIST} ${SUBS_CLIP}${move} ${cap}`;
  });
  protected readonly subsToggleClass = SUBS_TOGGLE;
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
    loader: ({ params }) => this.load(params),
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
    // The catalogue has no "not on the storefront" overlay to wait for.
    alsoWaitFor: computed(() => !this.slug() || this.deletedReady()),
  });
  protected readonly ready = this.content.ready;
  protected readonly editControls = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;

  /** The ＋ disc: an editor for this category, or the reason there is none. */
  protected addProduct(queryParams: Params): void {
    void this.productCreate.start(queryParams);
  }

  /** Either listing, as the one shape the template reads — `null` when the
   * slug names no category. */
  private async load(params: {
    slug: string | undefined;
    page: number;
    sort: ProductSort;
    attr: string[];
  }): Promise<Listing | null> {
    const { slug, page, sort, attr } = params;
    if (!slug) {
      const { categories, ...listing } = await this.catalog.getCatalogProducts(
        page,
        sort,
        attr,
      );
      return { category: null, subcategories: categories, ...listing };
    }
    const result = await this.catalog.getCategoryProducts(
      slug,
      page,
      sort,
      attr,
    );
    if (!result) return null;
    const { subcategories, ...category } = result.category;
    return { ...result, category, subcategories };
  }

  constructor() {
    usePageSeo({
      // Guarded: `value()` throws on an errored resource.
      name: () => {
        if (!this.slug()) return this.text.catalogRoot;
        return this.products.hasValue()
          ? this.products.value()?.category?.name
          : undefined;
      },
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
    if (!this.slug()) return false;
    return this.subsOverflow() ?? count > SUBS_ASSUMED_FIT;
  }

  private measureSubs(): void {
    const el = this.subsList()?.nativeElement;
    if (!el) return;
    // scrollHeight is the unclipped height in both states, so one test answers
    // for the collapsed list and the expanded one alike — and the same number
    // is what the open state is clipped to.
    this.subsOverflow.set(el.scrollHeight > SUBS_CLIP_HEIGHT + 1);
    this.subsFullHeight.set(`${el.scrollHeight}px`);
  }

  /** How many products the current filters leave — the whole listing, not the
   * page of it on screen: the pagination below says which page this is. */
  protected productCount(total: number): string {
    return fillText(this.text.productCount, { count: total });
  }

  protected pageStatus(p: { page: number; totalPages: number }): string {
    return this.text.pageStatus
      .replace('{page}', String(p.page))
      .replace('{total}', String(p.totalPages));
  }
}
