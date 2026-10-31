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
import { Params } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import {
  CategoryCrumb,
  categoryDisplayName,
  PRODUCT_SORTS,
  ProductListItem,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  CATALOG_SORTS,
  CatalogSort,
  Facet,
  ListingSort,
  SubcategoryLink,
} from '@b2b-catalog-platform/shared/storefront/catalog';
import {
  Breadcrumbs,
  Crumb,
} from '@b2b-catalog-platform/ui/content/breadcrumbs';
import { disclosureState } from '@b2b-catalog-platform/ui/disclosure/disclosure-state';
import { ShowMoreToggle } from '@b2b-catalog-platform/ui/disclosure/show-more-toggle';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { usePageSeo } from '../../../shared/core/page-seo';
import { stableValue } from '../../../shared/core/stable-value';
import {
  EDIT_ACTIONS_INSET,
  EditActions,
} from '../../../shared/edit-mode/edit-actions';
import { editAwareContent } from '../../../shared/edit-mode/edit-aware-content';
import { EditModeService } from '../../../shared/edit-mode/edit-mode.service';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import { LoadErrorView } from '../../platform/load-error-view';
import { NotFoundView } from '../../platform/not-found-view';
import { CatalogService } from '../catalog.service';
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
import { CategoryChip } from '../ui/category-chip';
import { PRODUCT_GRID } from '../ui/product-tile';
import { ProductListing } from '../ui/product-listing';
import { CATEGORY_GRID } from './category-index';
import { HiddenProductsSection } from './hidden-products-section';

/** The phone's clip (SUBS_CLIPPED) in px: four `h-16` chip rows, their
 * `gap-3`s and SUBS_LIST's 4px inset. The CSS clips; this only asks whether
 * anything was clipped. */
const SUBS_CLIP_HEIGHT = 300;

/** What fits the clip until the first measurement, as on the server. */
const SUBS_ASSUMED_FIT = 4;

/** The index's grid, so the chips line up with the cards below. `-m-1 p-1`
 * gives the clip room for the focus outline of the chips on its rim. */
const SUBS_LIST = `${CATEGORY_GRID} -m-1 p-1`;

/** Four chip rows on a phone, open from `sm` up: a class, since the server
 * has no width. Both states are lengths, the open one the measured height,
 * because a transition to or from `none` does not run. */
const SUBS_CLIP = 'overflow-hidden sm:max-h-none sm:overflow-visible';
const SUBS_CLIPPED = 'max-h-75';
const SUBS_OPEN = 'max-h-[calc(var(--subs-full,100rem)+0.5rem)]';
const SUBS_MOVE = 'transition-[max-height] duration-200 ease-out';

const SUBS_TOGGLE = 'mt-2 sm:hidden';

/** A category's listing, or with `category` null the whole catalogue's, whose
 * chips are the top level. */
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

/** A category's listing (FR-CAT-03/04): breadcrumb, subcategory chips, then
 * every product of the category and its descendants. Without a slug it is the
 * catalogue (FR-CAT-02), one level up. */
@Component({
  selector: 'app-category-grid',
  imports: [
    ProductListing,
    Breadcrumbs,
    ProductLayoutToggle,
    ProductSortSelect,
    FacetPanel,
    AppliedFilters,
    CategoryChip,
    ShowMoreToggle,
    EditActions,
    HiddenProductsSection,
    NotFoundView,
    LoadErrorView,
  ],
  template: `
    <!-- Everything inside measures this container, not the window, so all
         of it turns narrow in one step. -->
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
          @if (editControls(); as editText) {
            @if (data.category; as category) {
              <app-edit-actions
                [listLink]="['/admin/products']"
                [listParams]="{ category: category.slug }"
                [listLabel]="editText.showInList"
                [filtersLink]="['/admin/categories', category.slug, 'filters']"
                [filtersParams]="editorFrom()"
                [filtersLabel]="editText.editFilters"
                [editLink]="['/admin/categories', category.slug, 'edit']"
                [editParams]="editorFrom()"
                [editLabel]="editText.editCategory"
              />
            } @else {
              <app-edit-actions
                [listLink]="['/admin/products']"
                [listLabel]="editText.showInList"
                [filtersLink]="['/admin/catalog/filters']"
                [filtersParams]="editorFrom()"
                [filtersLabel]="editText.editFilters"
                [editLink]="['/admin/categories']"
                [editLabel]="editText.editCategories"
              />
            }
          }
          <!-- A trail of one on the catalogue too, so the heading sits where a
               category's does. The selection goes upward too: a wider scope
               offers every value the narrower one did. -->
          <ui-breadcrumbs
            [class]="editControls() ? editActionsInset : ''"
            [label]="text.catalogRoot"
            [crumbs]="crumbs()"
            [current]="
              data.category ? displayName(data.category) : text.catalogRoot
            "
          />

          <div
            class="mt-2 flex flex-wrap items-center justify-between gap-x-6
                   gap-y-3"
          >
            <h1
              class="text-2xl font-medium tracking-tight
                     @min-[38rem]/listing:text-3xl"
            >
              {{ data.category?.name ?? text.catalogRoot }}
            </h1>

            <app-applied-filters
              class="hidden min-w-0 flex-1 @min-[38rem]/listing:block"
              [facets]="data.facets"
            />
          </div>

          @if (data.subcategories.length) {
            <!-- Every subcategory; only a phone clips them, where the column
                 would bury the products. -->
            <div class="mt-6">
              <ul
                #subsList
                [id]="subsListId"
                [class]="subsListClass()"
                [style.--subs-full]="subsFullHeight()"
              >
                @for (sub of data.subcategories; track sub.slug) {
                  <li class="relative">
                    @if (editControls(); as editText) {
                      <app-edit-actions
                        variant="tile"
                        [editLink]="['/admin/categories', sub.slug, 'edit']"
                        [editParams]="editorFrom()"
                        [editLabel]="editText.editCategory"
                      />
                    }
                    <!-- Sort and selection go down too, as much of the
                         selection as the subcategory offers; a chip it leaves
                         empty is greyed and leads in unfiltered. -->
                    <app-category-chip
                      [category]="sub"
                      [muted]="sub.count === 0"
                      [queryParams]="{
                        sort: sortParam(),
                        attr: sub.count && sub.attr.length ? sub.attr : null,
                      }"
                    />
                  </li>
                }
              </ul>
              @if (subsToggle(data.subcategories.length)) {
                <ui-show-more-toggle
                  [class]="subsToggleClass"
                  [expanded]="showAllSubs()"
                  [controls]="subsListId"
                  (toggled)="subsDisclosure.toggle()"
                />
              }
            </div>
          }

          <div class="mt-6" [class]="facetLayout">
            @if (data.facets.length) {
              <aside [class]="facetColumn">
                <app-facet-panel
                  [facets]="data.facets"
                  [sort]="shownSort()"
                  [defaultSort]="defaultSort()"
                  [sortOptions]="sortOptions()"
                />
              </aside>
            }
            <div [class]="data.facets.length ? listingColumn : listingAlone">
              @if (data.items.length) {
                <app-product-listing
                  [items]="data.items"
                  [cards]="cards()"
                  [loading]="products.isLoading()"
                  [countLabel]="productCount(data.pagination.total)"
                  [link]="listingLink()"
                  [page]="data.pagination.page"
                  [totalPages]="data.pagination.totalPages"
                  [pageParams]="pageParams"
                  [editText]="editControls()"
                  [editorFrom]="editorFrom()"
                >
                  <app-product-sort-select
                    shape="segments"
                    [class]="data.facets.length ? headerSortAt : ''"
                    [value]="shownSort()"
                    [defaultSort]="defaultSort()"
                    [options]="sortOptions()"
                  />
                  <app-product-layout-toggle />
                </app-product-listing>
              } @else {
                <p class="text-ink-subtle">
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
          <!-- With the breadcrumb, so the title does not jump. -->
          <div class="space-y-3">
            <div
              class="h-4 w-1/2 rounded-sm bg-skeleton
                     @min-[38rem]/listing:w-1/3"
            ></div>
            <div class="h-8 w-1/3 rounded-sm bg-skeleton"></div>
          </div>
          <div [class]="productGrid">
            @for (i of skeletons; track i) {
              <div class="aspect-square rounded-lg bg-skeleton"></div>
            }
          </div>
        </div>
      }

      <!-- Outside the branch: the grid waits for this fetch, so it must not
           wait for the grid. Drawn only under a drawn grid, as it often loads
           first. -->
      @defer (when editMode.enabled()) {
        @if (editMode.enabled() && slug(); as categorySlug) {
          <app-hidden-products-section
            [class.hidden]="!ready()"
            [categorySlug]="categorySlug"
            (loaded)="hiddenReady.set(true)"
            (published)="products.reload()"
          />
        }
      }
    </section>
  `,
})
export class CategoryGrid {
  protected readonly productGrid = PRODUCT_GRID;
  protected readonly editActionsInset = EDIT_ACTIONS_INSET;
  protected readonly headerSortAt = FACET_HEADER_SORT;
  protected readonly facetLayout = FACET_LAYOUT;
  protected readonly facetColumn = FACET_COLUMN;
  protected readonly listingColumn = FACET_SIBLING;
  protected readonly listingAlone = FACET_SIBLING_ALONE;

  private readonly catalog = inject(CatalogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly productLayout = inject(ProductLayoutService);
  protected readonly editMode = inject(EditModeService);
  protected readonly text = inject(STOREFRONT_TEXT).catalog;
  protected readonly filterText = this.text.filters;
  protected readonly editorFrom = injectEditorReturnParams();
  protected readonly skeletons = Array.from({ length: 8 }, (_, i) => i);
  /** Crumbs may use the short name; the heading keeps the full one. */
  protected readonly displayName = categoryDisplayName;

  protected readonly cards = computed(
    () => this.productLayout.layout() === 'grid',
  );

  /** Absent on `/catalog` itself. */
  readonly slug = input<string>();
  readonly page = input('1');
  readonly sort = input('');
  readonly attr = input<string | readonly string[] | undefined>(undefined);

  private readonly params = listingParams(
    { page: this.page, sort: this.sort, attr: this.attr },
    CATALOG_SORTS,
    'category',
  );
  protected readonly sortParam = this.params.sortParam;
  protected readonly attrParam = this.params.attrParam;
  protected readonly hasSelection = this.params.hasSelection;

  protected readonly crumbs = computed<Crumb[]>(() => {
    const category = this.shown()?.category;
    if (!category) return [];
    const queryParams = { sort: this.sortParam(), attr: this.attrParam() };
    return [
      { label: this.text.catalogRoot, link: '/catalog' },
      ...category.ancestors.map((crumb) => ({
        label: categoryDisplayName(crumb),
        link: ['/catalog', crumb.slug],
        queryParams,
      })),
    ];
  });

  protected readonly listingLink = computed(() => {
    const slug = this.slug();
    return slug ? ['/catalog', slug] : ['/catalog'];
  });

  /** Grouping is offered only where there are groups; on a leaf the control
   * says name, and choosing it writes the plain URL. */
  private readonly grouped = computed(
    () => (this.shown()?.subcategories.length ?? 0) > 0,
  );
  protected readonly sortOptions = computed(() =>
    this.grouped() ? CATALOG_SORTS : PRODUCT_SORTS,
  );
  protected readonly defaultSort = computed<ListingSort>(() =>
    this.grouped() ? 'category' : 'name',
  );
  protected readonly shownSort = computed<ListingSort>(() => {
    const sort = this.params.sort();
    return !this.grouped() && sort === 'category' ? 'name' : sort;
  });

  protected readonly subsDisclosure = disclosureState(200);
  protected readonly showAllSubs = this.subsDisclosure.open;
  protected readonly subsListId = 'subcategories';
  private readonly subsList = viewChild<ElementRef<HTMLElement>>('subsList');
  /** Null until measured; the chip count stands in until then. */
  private readonly subsOverflow = signal<boolean | null>(null);
  /** The open state's `max-height`. */
  protected readonly subsFullHeight = signal<string | null>(null);
  protected readonly subsListClass = computed(() => {
    // The catalogue's top level is the page's content: never clipped.
    if (!this.slug()) return SUBS_LIST;
    const move = this.subsDisclosure.animated() ? ` ${SUBS_MOVE}` : '';
    const cap = this.showAllSubs() ? SUBS_OPEN : SUBS_CLIPPED;
    return `${SUBS_LIST} ${SUBS_CLIP}${move} ${cap}`;
  });
  protected readonly subsToggleClass = SUBS_TOGGLE;
  /** The hidden-products overlay has loaded in this edit-mode session. */
  protected readonly hiddenReady = signal(false);

  protected readonly products = resource({
    params: () => ({
      slug: this.slug(),
      page: this.params.page(),
      sort: this.params.sort(),
      attr: this.params.attr(),
    }),
    loader: ({ params }) => this.load(params),
  });

  /** Held across reloads, so re-sorting swaps the grid without blanking it. */
  protected readonly shown = stableValue(this.products);

  /** In edit mode the hidden-products overlay is waited for too. A missing
   * category is a loaded `null`, so `undefined` is the test. */
  private readonly content = editAwareContent({
    ready: computed(() => this.shown() !== undefined),
    section: 'editMode',
    // The catalogue has no "not on the storefront" overlay to wait for.
    alsoWaitFor: computed(() => !this.slug() || this.hiddenReady()),
  });
  protected readonly ready = this.content.ready;
  protected readonly editControls = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;

  /** `null` when the slug names no category. */
  private async load(params: {
    slug: string | undefined;
    page: number;
    sort: CatalogSort;
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
    // Re-armed when edit mode turns off, so re-entering waits for a fresh load.
    effect(() => {
      if (!this.editMode.enabled()) this.hiddenReady.set(false);
    });

    // Re-asked on every resize, and when the list arrives or goes.
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

  protected subsToggle(count: number): boolean {
    if (!this.slug()) return false;
    return this.subsOverflow() ?? count > SUBS_ASSUMED_FIT;
  }

  private measureSubs(): void {
    const el = this.subsList()?.nativeElement;
    if (!el) return;
    // scrollHeight is the unclipped height whether open or not.
    this.subsOverflow.set(el.scrollHeight > SUBS_CLIP_HEIGHT + 1);
    this.subsFullHeight.set(`${el.scrollHeight}px`);
  }

  protected productCount(total: number): string {
    return fillText(this.text.productCount, { count: total });
  }

  protected readonly pageParams = (page: number): Params => ({
    page,
    sort: this.sortParam(),
    attr: this.attrParam(),
  });
}
