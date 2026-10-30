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
import { fillText } from '@b2b-catalog-platform/shared';
import {
  formatAttributeValue,
  ProductAvailability,
  SEARCH_QUERY_MAX_LENGTH,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  AdminProductSort,
  IncompleteGap,
  PRODUCT_FEATURES,
  PRODUCT_GAP_FILTERS,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { NgTemplateOutlet } from '@angular/common';
import { PricePipe } from '../../../core/catalog/pricing/price.pipe';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { usePageSeo } from '../../../shared/core/page-seo';
import { stableValue } from '../../../shared/core/stable-value';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import {
  confirmRequest,
  ConfirmService,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import { CategoriesService } from '../categories/categories.service';
import { ProductsService } from './products.service';
import { ProductCreateService } from './product-create.service';
import { AttributesService } from '../attributes/attributes.service';
import { flattenCategoryTree } from '../categories/category-tree';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import { DataGrid } from '@b2b-catalog-platform/ui/grid/data-grid';
import {
  GridChip,
  GridColumn,
  GridToggleGroup,
} from '@b2b-catalog-platform/ui/grid/grid-column';
import { GridFilterOption } from '@b2b-catalog-platform/ui/grid/grid-filter-select';
import { GridPagination } from '@b2b-catalog-platform/ui/grid/grid-pagination';
import {
  DEFAULT_SORT,
  DEFAULT_STATE,
  resolveAvailability,
  resolveSort,
  resolveState,
} from './product-grid-query';
import { GridCardTemplate } from '@b2b-catalog-platform/ui/grid/grid-card-template';
import { GridRowTemplate } from '@b2b-catalog-platform/ui/grid/grid-row-template';
import { GridTimestamp } from '../../dates/grid-timestamp';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { GridHeader } from '@b2b-catalog-platform/ui/grid/grid-header';
import { DocumentsService } from '../documents/documents.service';
import { TiersService } from '../tiers/tiers.service';
import { purgeWithConfirmation, PurgeText } from './product-removal';
import { ProductRowActions, ProductRowState } from './product-row-actions';
import {
  PRODUCT_FEATURE_GLYPHS,
  ProductFeatureGlyphs,
} from './product-feature-glyphs';
import { AVAILABILITY_TONES } from '../../../core/catalog/buying/product-availability-badge';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { ProductStateBadge, productState } from '../ui/product-state-badge';

/** The category filter's "without subcategories" option; a uuid never ends
 * this way. */
const DIRECT_SUFFIX = ':direct';

/** The entries of a list parameter that are one of `known`, in its order. */

function knownValues<T extends string>(
  raw: string | readonly string[] | undefined,
  known: readonly T[],
): T[] {
  const given = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
  return known.filter((value) => given.includes(value));
}

/**
 * The product grid (FR-ADM-05): live and unpublished products, and the deleted
 * ones under their own state (FR-ADM-22), which is where a deletion is undone.
 */
@Component({
  selector: 'app-product-list-page',
  imports: [
    ProductStateBadge,
    NgTemplateOutlet,
    RouterLink,
    PricePipe,
    ProductFeatureGlyphs,
    Icon,
    Button,
    Link,
    ProductRowActions,
    GridHeader,
    DataGrid,
    GridRowTemplate,
    GridCardTemplate,
    GridPagination,
    GridTimestamp,
    Skeleton,
    StatusBadge,
    RecordRow,
  ],
  template: `
    <ui-grid-header
      [title]="text.page.title"
      [intro]="text.page.intro"
      [query]="query() ?? ''"
      [searchMaxLength]="searchMaxLength"
      [searchLabel]="text.searchAria"
      [searchPlaceholder]="text.searchPlaceholder"
      [clearSearchLabel]="text.clearSearch"
      [filtered]="filtered()"
    >
      <!-- Kept while the catalog is owned: the click then explains. -->
      <button uiButton type="button" class="gap-2" (click)="addProduct()">
        <ui-icon [glyph]="plusIcon" class="size-4" />
        {{ editText.addProduct }}
      </button>
    </ui-grid-header>

    @if (products.error()) {
      <p class="text-ink-subtle" role="alert">{{ adminText.loadError }}</p>
    } @else if (shown(); as data) {
      <ui-data-grid
        gridId="products"
        [columns]="columns()"
        [rows]="data.items"
        [trackBy]="bySlug"
        [muted]="isDeleted"
        [sort]="headerSort()"
        [defaultSort]="defaultSort"
        [defaultSortLabel]="text.bestMatch"
        [chips]="chips()"
        [toggles]="toggles()"
        [busy]="products.isLoading()"
        [filtered]="filtered()"
        [emptyMessage]="filtered() ? text.noResults : text.empty"
        [total]="data.pagination.total"
        [countLabel]="productStates.count"
      >
        <!-- A search that finds nothing may mean a deleted product
             (FR-ADM-22); the link keeps every filter but the state. -->
        @if (data.deletedMatches; as count) {
          <p gridEmpty class="mt-2 text-ink-subtle">
            {{ deletedMatchesLabel(count) }}
            <a
              uiLink
              [routerLink]="[]"
              [queryParams]="{ state: 'deleted', page: null }"
              queryParamsHandling="merge"
              >{{ text.showDeleted }}</a
            >
          </p>
        }
        <ng-template uiGridRow [of]="data.items" let-item>
          <td>
            <div
              class="size-10 overflow-hidden rounded-sm border border-edge
                     bg-white"
            >
              @if (item.thumb) {
                <img
                  [src]="item.thumb"
                  alt=""
                  class="size-full bg-white object-contain"
                />
              }
            </div>
          </td>
          <td>
            <!-- The sync key trails the name in one flow, so a wrapping name
                 does not push it onto a line of its own. -->
            <div class="line-clamp-3 wrap-break-word [word-spacing:0.25rem]">
              <a
                [routerLink]="['/product', item.slug]"
                [queryParams]="editorFrom()"
                class="align-middle font-medium text-ink hover:text-accent [word-spacing:normal]"
                >{{ item.name }}</a
              >&ngsp;<span
                class="inline-block max-w-full truncate rounded-sm bg-surface px-1.5 py-0.5 align-middle font-mono text-xs [word-spacing:normal]"
                [title]="item.sourceId"
                >{{ item.sourceId }}</span
              >
            </div>
            <ng-container
              [ngTemplateOutlet]="content"
              [ngTemplateOutletContext]="{ $implicit: item }"
            />
          </td>
          <td>
            <!-- To where the visitor sees it, as the product's name. -->
            <div class="flex items-center">
              @if (categoryOf().get(item.categoryId); as category) {
                <a
                  [routerLink]="['/catalog', category.slug]"
                  [queryParams]="editorFrom()"
                  class="line-clamp-2 wrap-break-word text-ink-subtle
                         hover:text-accent"
                  >{{ category.name }}</a
                >
              }
            </div>
          </td>
          <td class="text-ink">
            @if (item.priceMinor === null) {
              <span [title]="productStates.unpriced">{{ text.noPrice }}</span>
            } @else {
              {{ item.priceMinor | price }}
            }
          </td>
          <td>
            <!-- The figure, not the word: restocking needs how many, and the
                 word is read out with it. The unit is spelled out, since a
                 pack or box count could be taken for it. -->
            @if (item.stockPieces === null) {
              <span class="text-ink-subtle">{{ text.stockUntracked }}</span>
            } @else {
              <span
                uiStatusBadge
                variant="dot"
                [tone]="stockTone(item)"
                [attr.aria-label]="stockLabel(item)"
              >
                {{ item.stockPieces }}&nbsp;{{ pieceSuffix }}
              </span>
            }
          </td>
          <td data-keep>
            <app-product-state-badge [state]="stateOf(item)" [live]="true" />
          </td>
          <td class="text-ink-subtle">
            <app-grid-timestamp [value]="item.updatedAt" />
          </td>
          <td data-keep>
            <app-product-row-actions
              [product]="item"
              [returnParams]="editorFrom()"
              [busy]="publishing() === item.slug"
              (publishToggled)="togglePublished($event)"
              (restored)="restore($event)"
              (deleteRequested)="remove($event)"
              (purgeRequested)="purge($event)"
            />
          </td>
        </ng-template>

        <!-- On a phone the photo stays, the fastest way to recognise one; the
             category is detail for the editor. -->
        <ng-template uiGridCard [of]="data.items" let-item>
          <!-- A deleted product is greyed, never the badge or the buttons
               that undo it, as in the table. -->
          <ui-record-row>
            <div
              recordLead
              class="size-14 shrink-0 overflow-hidden rounded-sm border
                     border-edge bg-white"
              [class.opacity-50]="isDeleted(item)"
            >
              @if (item.thumb) {
                <img
                  [src]="item.thumb"
                  alt=""
                  class="size-full bg-white object-contain"
                />
              }
            </div>
            <a
              [routerLink]="['/product', item.slug]"
              [queryParams]="editorFrom()"
              class="font-medium wrap-break-word line-clamp-2 text-ink"
              [class.opacity-50]="isDeleted(item)"
            >
              {{ item.name }}
            </a>
            <app-product-state-badge
              recordBadge
              [state]="stateOf(item)"
              [live]="true"
            />
            <span
              class="max-w-full truncate rounded-sm bg-surface px-1.5 py-0.5
                     font-mono text-xs"
              [class.opacity-50]="isDeleted(item)"
              >{{ item.sourceId }}</span
            >
            <ng-container
              [ngTemplateOutlet]="content"
              [ngTemplateOutletContext]="{ $implicit: item, card: true }"
            />
            <ng-container recordMeta>
              <span class="text-ink" [class.opacity-50]="isDeleted(item)">
                @if (item.priceMinor === null) {
                  {{ productStates.unpriced }}
                } @else {
                  {{ item.priceMinor | price }}
                }
              </span>
              @if (item.stockPieces !== null) {
                <span
                  uiStatusBadge
                  variant="dot"
                  [tone]="stockTone(item)"
                  [attr.aria-label]="stockLabel(item)"
                  [class.opacity-50]="isDeleted(item)"
                  >{{ item.stockPieces }}&nbsp;{{ pieceSuffix }}</span
                >
              }
              <app-grid-timestamp
                [value]="item.updatedAt"
                inline
                [class.opacity-50]="isDeleted(item)"
              />
            </ng-container>
            <app-product-row-actions
              recordActions
              [product]="item"
              [returnParams]="editorFrom()"
              [busy]="publishing() === item.slug"
              (publishToggled)="togglePublished($event)"
              (restored)="restore($event)"
              (deleteRequested)="remove($event)"
              (purgeRequested)="purge($event)"
            />
          </ui-record-row>
        </ng-template>
      </ui-data-grid>

      <ui-grid-pagination [pagination]="data.pagination" />
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="6" />
    }

    <!-- What the product carries and lacks (FR-ADM-20); the gaps in amber,
         so they read as work. In the card it flows beside the sync key,
         where a top margin would lift it off the line. -->
    <ng-template #content let-item let-card="card">
      @if (item.features.length || item.gaps.length) {
        <div
          class="flex flex-wrap items-center gap-x-2 gap-y-1"
          [class.mt-1]="!card"
          [class.opacity-50]="isDeleted(item)"
        >
          @if (item.features.length) {
            <app-product-feature-glyphs [features]="item.features" />
          }
          @if (item.gaps.length) {
            <span class="text-xs text-warning">{{ gapsLabel(item.gaps) }}</span>
          }
        </div>
      }
    </ng-template>
  `,
})
export class ProductListPage {
  protected readonly searchMaxLength = SEARCH_QUERY_MAX_LENGTH;
  protected readonly plusIcon = plusIcon;
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly attributes = inject(AttributesService);
  private readonly tierService = inject(TiersService);
  private readonly documentService = inject(DocumentsService);
  private readonly router = inject(Router);
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.list;
  protected readonly editText = inject(ADMIN_TEXT).editMode;
  protected readonly productStates = inject(ADMIN_TEXT).products;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  private readonly purgeText: PurgeText = {
    ...this.editText,
    cancel: this.actionText.cancel,
    close: this.actionText.close,
    owned: inject(ADMIN_TEXT).ownership.productPurge,
    errors: this.adminText.catalogErrors,
  };
  private readonly confirm = inject(ConfirmService);
  private readonly productCreate = inject(ProductCreateService);
  protected readonly productText = inject(ADMIN_TEXT).products.editor;
  /** The storefront's words, so grid and product page name one fact alike. */
  protected readonly availabilityText =
    inject(SHARED_TEXT).product.availability;
  protected readonly editorFrom = injectEditorReturnParams();

  /** The grid's state comes from the URL, each input named for its query
   * parameter, and is narrowed before it reaches the API. */
  readonly page = input('1');
  protected readonly currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

  readonly searchTerm = input('');
  protected readonly query = computed(() =>
    this.searchTerm() ? this.searchTerm().trim() : undefined,
  );

  readonly sort = input('');
  protected readonly defaultSort = DEFAULT_SORT;
  protected readonly sortKey = computed(() => resolveSort(this.sort()));
  /** `relevance` is no column: with a query it is the ranking, without one
   * the API sorts by state, so that heading lights up. Display only. */
  protected readonly headerSort = computed<AdminProductSort | null>(() => {
    if (this.sortKey() !== 'relevance') return this.sortKey();
    return this.query() ? null : 'state';
  });

  readonly state = input('');
  protected readonly stateKey = computed(() => resolveState(this.state()));
  /** The default is the unfiltered option, whose empty value clears the
   * parameter. */
  protected readonly stateParam = computed(() =>
    this.stateKey() === DEFAULT_STATE ? '' : this.stateKey(),
  );

  readonly availability = input('');
  protected readonly availabilityKey = computed(() =>
    resolveAvailability(this.availability()),
  );

  /** Not narrowed: an unknown uuid gets an empty page, a non-uuid a contract
   * refusal. Covers the subtree, as the storefront does (FR-ADM-19). */
  readonly categoryId = input('');
  /** `direct` leaves out the subcategories' products. */
  readonly categoryScope = input('');
  protected readonly categoryDirect = computed(
    () => !!this.categoryId() && this.categoryScope() === 'direct',
  );

  /** The drill-downs from the inventory (FR-ATTR-09), the tier list and the
   * document list (FR-DOC-02): no column of their own, so each is a chip. */
  readonly attributeKey = input('');
  readonly attributeValue = input('');
  readonly tierId = input('');
  /** Rides on the tier's chip: "not priced in wholesale" is one filter. */
  readonly tierPriced = input('');
  readonly documentId = input('');

  /** FR-ADM-20. One entry arrives as a bare string, more as an array. */
  readonly missing = input<string | readonly string[] | undefined>(undefined);
  readonly has = input<string | readonly string[] | undefined>(undefined);
  protected readonly missingKeys = computed(() =>
    knownValues(this.missing(), PRODUCT_GAP_FILTERS),
  );
  protected readonly hasKeys = computed(() =>
    knownValues(this.has(), PRODUCT_FEATURES),
  );

  /** What a product has, with its row's glyphs, then the gaps. */
  protected readonly toggles = computed<GridToggleGroup[]>(() => [
    {
      ariaLabel: this.text.hasGroupAria,
      param: 'has',
      options: PRODUCT_FEATURES.map((feature) => ({
        value: feature,
        label: this.text.has[feature],
        icon: PRODUCT_FEATURE_GLYPHS[feature],
      })),
      selected: this.hasKeys(),
    },
    {
      ariaLabel: this.text.missingGroupAria,
      param: 'missing',
      options: PRODUCT_GAP_FILTERS.map((gap) => ({
        value: gap,
        label: this.text.missing[gap],
      })),
      selected: this.missingKeys(),
    },
  ]);

  // The chips' names are fetched only while a chip shows, and a failure
  // leaves the chip absent or unadorned rather than the list broken.
  private readonly documents = resource({
    params: () => (this.documentId() ? { id: this.documentId() } : undefined),
    loader: ({ params }) =>
      this.documentService.get(params.id).catch(() => undefined),
  });
  protected readonly documentFilter = computed(
    () => this.documents.value()?.title ?? null,
  );
  private readonly tiers = resource({
    params: () => (this.tierId() ? { id: this.tierId() } : undefined),
    loader: () =>
      this.tierService.list().then(
        (r) => r.tiers,
        () => [],
      ),
  });
  /** The chip waits for the name rather than showing a uuid. */
  protected readonly tierFilter = computed(() => {
    const id = this.tierId();
    if (!id) return null;
    return (this.tiers.value() ?? []).find((t) => t.id === id)?.label ?? null;
  });
  private readonly definitions = resource({
    params: () =>
      this.attributeKey() ? { key: this.attributeKey() } : undefined,
    loader: () => this.attributes.list().catch(() => []),
  });

  /** With the declared unit, as the storefront shows it; the inventory, where
   * values are edited, keeps them as stored. */
  protected readonly attributeFilter = computed(() => {
    const key = this.attributeKey();
    if (!key) return null;
    const unit =
      (this.definitions.value() ?? []).find((d) => d.name === key)?.unit ??
      null;
    const value = this.attributeValue();
    return { key, value: value ? formatAttributeValue(value, unit) : null };
  });

  /** What separates "no products" from "no matches". */
  protected readonly filtered = computed(
    () =>
      !!this.query() ||
      !!this.categoryId() ||
      !!this.availabilityKey() ||
      !!this.attributeFilter() ||
      !!this.tierId() ||
      !!this.documentId() ||
      this.missingKeys().length > 0 ||
      this.hasKeys().length > 0 ||
      this.stateKey() !== DEFAULT_STATE,
  );

  private readonly categories = resource({
    loader: () => this.categoriesService.list(),
  });
  protected readonly categoryOf = computed(
    () => new Map((this.categories.value() ?? []).map((c) => [c.id, c])),
  );

  /** A slug, all the storefront knows of a category: swapped for the id once
   * the tree is here, and the rows wait for it. An unknown one unfilters. */
  readonly category = input('');

  /**
   * A category with subcategories and products of its own gets a second
   * option for those alone, indented like a child, or a product left in a
   * parent is lost among everything beneath it. Elsewhere both would list the
   * same rows, so it is offered only where it is in effect.
   */
  protected readonly categoryOptions = computed<GridFilterOption[]>(() => {
    const options: GridFilterOption[] = [
      { value: '', label: this.text.allCategories },
    ];
    const current = this.categoryDirect() ? this.categoryId() : null;
    for (const node of flattenCategoryTree(this.categories.value() ?? [])) {
      const { id, name, childCount, directProductCount } = node.category;
      options.push({ value: id, label: name, depth: node.depth });
      if ((childCount > 0 && directProductCount > 0) || id === current) {
        options.push({
          value: id + DIRECT_SUFFIX,
          label: fillText(this.text.categoryDirect, { name }),
          depth: node.depth + 1,
        });
      }
    }
    return options;
  });

  /** Splits the select's value back into the category and its scope. */
  private readonly categoryParams = (
    value: string,
  ): Record<string, string | null> =>
    value.endsWith(DIRECT_SUFFIX)
      ? {
          categoryId: value.slice(0, -DIRECT_SUFFIX.length),
          categoryScope: 'direct',
        }
      : { categoryId: value || null, categoryScope: null };

  /** A computed: two columns carry the filter values in effect. */
  protected readonly columns = computed<GridColumn[]>(() => [
    {
      key: 'thumb',
      srLabel: this.productText.images.heading,
      fixedWidth: 48,
    },
    {
      key: 'name',
      label: this.productText.name,
      sort: { asc: 'name', desc: 'name_desc' },
      minWidth: 200,
    },
    {
      key: 'category',
      label: this.text.allCategories,
      minWidth: 120,
      filter: {
        param: 'categoryId',
        options: this.categoryOptions(),
        value: this.categoryDirect()
          ? this.categoryId() + DIRECT_SUFFIX
          : this.categoryId(),
        label: this.text.filterCategory,
        toParams: this.categoryParams,
      },
    },
    {
      key: 'price',
      label: this.productText.price,
      sort: { asc: 'price', desc: 'price_desc' },
      minWidth: 90,
    },
    // Filtered, not sorted: a manager works through "only what is out".
    {
      key: 'stock',
      label: this.text.stockAll,
      sortName: this.text.stock,
      filter: {
        param: 'availability',
        options: this.stockOptions,
        value: this.availabilityKey() ?? '',
        label: this.text.filterStock,
      },
      minWidth: 110,
    },
    {
      key: 'state',
      label: this.text.stateAll,
      sortName: this.text.state,
      sort: { asc: 'state', desc: 'state_desc' },
      filter: {
        param: 'state',
        options: this.stateOptions,
        value: this.stateParam(),
        label: this.text.filterState,
      },
      minWidth: 120,
    },
    {
      key: 'updated',
      label: this.text.updated,
      sort: { asc: 'updated', desc: 'updated_desc', descFirst: true },
      minWidth: 100,
    },
    // Three glyphs at 24px, with their gaps and the cell's own padding.
    {
      key: 'actions',
      srLabel: this.editText.editProduct,
      align: 'right',
      fixedWidth: 88,
    },
  ]);

  /** The drill-downs, counted with the grid's own filters. */
  protected readonly chips = computed<GridChip[]>(() => {
    const chips: GridChip[] = [];
    const tier = this.tierFilter();
    if (tier) {
      chips.push({
        label:
          this.tierPriced() === 'no'
            ? this.text.tierPricedNo
            : this.text.tierPricedYes,
        value: tier,
        clearParams: { tierId: null, tierPriced: null, page: null },
        clearLabel: this.text.clearTierAria,
      });
    }
    const document = this.documentFilter();
    if (document) {
      chips.push({
        label: this.text.filterDocument,
        value: document,
        clearParams: { documentId: null, page: null },
        clearLabel: this.text.clearDocumentAria,
      });
    }
    const attribute = this.attributeFilter();
    if (attribute) {
      chips.push({
        label: this.text.filterAttribute,
        value: attribute.value
          ? `${attribute.key} = ${attribute.value}`
          : attribute.key,
        clearParams: { attributeKey: null, attributeValue: null, page: null },
        clearLabel: this.text.clearAttributeAria,
      });
    }
    return chips;
  });

  protected readonly bySlug = (item: { slug: string }): string => item.slug;

  /** Greyed while out of the catalogue; an unpublished one is not, since it is
   * waiting on somebody. */
  protected readonly isDeleted = (item: {
    deletedAt: string | null;
  }): boolean => !!item.deletedAt;

  protected readonly stateOf = productState;

  protected stockTone(item: {
    availability: ProductAvailability | null;
  }): StatusTone {
    return AVAILABILITY_TONES[item.availability ?? 'in'];
  }

  protected readonly pieceSuffix = inject(SHARED_TEXT).units.piece;

  /** The unit is in `stockAria`'s wording, so it is not read out twice. */
  protected stockLabel(item: {
    stockPieces: number | null;
    availability: ProductAvailability | null;
  }): string {
    return fillText(this.text.stockAria, {
      count: item.stockPieces ?? 0,
      state: this.availabilityText[item.availability ?? 'in'],
    });
  }

  /** What is gone first: the list a manager comes to act on. */
  protected readonly stockOptions: GridFilterOption[] = [
    { value: '', label: this.text.stockAll },
    { value: 'out', label: this.availabilityText.out },
    { value: 'low', label: this.availabilityText.low },
    { value: 'in', label: this.availabilityText.in },
  ];

  protected deletedMatchesLabel(count: number): string {
    return fillText(this.text.deletedMatches, { count });
  }

  protected gapsLabel(gaps: readonly IncompleteGap[]): string {
    return fillText(this.text.gapsLabel, {
      gaps: gaps.map((gap) => this.text.gap[gap]).join(', '),
    });
  }

  protected readonly stateOptions: GridFilterOption[] = [
    { value: '', label: this.text.stateAll },
    { value: 'live', label: this.text.stateLive },
    { value: 'unpublished', label: this.productStates.unpublished },
    { value: 'deleted', label: this.productStates.deleted },
  ];

  protected readonly products = resource({
    params: () =>
      this.category()
        ? undefined
        : {
            page: this.currentPage(),
            q: this.query(),
            sort: this.sortKey(),
            state: this.stateKey(),
            availability: this.availabilityKey(),
            categoryId: this.categoryId() || undefined,
            categoryScope: this.categoryDirect()
              ? ('direct' as const)
              : undefined,
            attributeKey: this.attributeKey() || undefined,
            attributeValue: this.attributeValue() || undefined,
            tierId: this.tierId() || undefined,
            tierPriced:
              this.tierPriced() === 'no' ? ('no' as const) : undefined,
            documentId: this.documentId() || undefined,
            missing: this.missingKeys().length ? this.missingKeys() : undefined,
            has: this.hasKeys().length ? this.hasKeys() : undefined,
          },
    loader: ({ params }) => this.productsService.list(params),
  });

  /** Held across reloads, so a filter swaps the rows instead of blanking the
   * table and its controls. */
  protected readonly shown = stableValue(this.products);

  protected readonly showSkeleton = delayedLoading(this.products.isLoading);

  protected readonly publishing = signal<string | null>(null);

  /** Unpublishing is confirmed: taking a product off sale weighs as much as
   * deleting it. */
  protected async togglePublished(item: ProductRowState): Promise<void> {
    const publish = item.publishedAt === null;
    if (
      !publish &&
      !(await this.confirm.ask({
        ...confirmRequest(
          this.editText.unpublishConfirm,
          this.actionText.cancel,
        ),
        message: await this.productsService.unpublishMessage(
          item,
          this.editText,
        ),
        confirmVariant: 'danger',
      }))
    ) {
      return;
    }
    this.publishing.set(item.slug);
    try {
      await this.productsService.setPublished(item.slug, publish);
      this.products.reload();
    } finally {
      this.publishing.set(null);
    }
  }

  /** A grid narrowed to one category starts the product in it. */
  protected addProduct(): void {
    const category = this.categoryOf().get(this.categoryId())?.slug;
    void this.productCreate.start({ category, ...this.editorFrom() });
  }

  /** Unconfirmed: the row has already said why a live product cannot go, and
   * restore undoes the rest in one click (FR-ADM-01). */
  protected async remove(item: ProductRowState): Promise<void> {
    await this.productsService.remove(item.slug);
    this.products.reload();
  }

  protected async purge(item: ProductRowState): Promise<void> {
    await purgeWithConfirmation(
      this.confirm,
      this.productsService,
      this.purgeText,
      item,
    );

    this.products.reload();
  }

  protected async restore(item: ProductRowState): Promise<void> {
    await this.productsService.restore(item.slug);
    this.products.reload();
  }

  constructor() {
    this.productCreate.prepare();
    effect(() => {
      const slug = this.category();
      const tree = this.categories.value();
      if (!slug || (!tree && !this.categories.error())) return;
      const id = tree?.find((c) => c.slug === slug)?.id ?? null;
      void this.router.navigate(['/admin/products'], {
        queryParams: { category: null, categoryId: id, categoryScope: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
    usePageSeo({ name: () => this.text.page.title });
  }
}
