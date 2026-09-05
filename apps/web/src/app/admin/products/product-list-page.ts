import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AdminProductSort,
  fillText,
  formatAttributeValue,
  ProductAvailability,
} from '@b2b-catalog-platform/shared';
import { PricePipe } from '../../catalog/price.pipe';
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { stableValue } from '../../core/stable-value';
import { Button } from '../../ui/button';
import { ConfirmService } from '../../ui/confirm.service';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Skeleton } from '../../ui/skeleton';
import { StatusBadge, StatusTone } from '../../ui/status-badge';
import { AdminCatalogService } from '../admin-catalog.service';
import { AttributesService } from '../attributes/attributes.service';
import { flattenCategoryTree } from '../categories/category-tree';
import { injectEditorReturnParams } from '../editor-return';
import { AdminGrid } from '../grid/admin-grid';
import { GridChip, GridColumn } from '../grid/grid-column';
import { GridFilterOption } from '../grid/grid-filter-select';
import { GridPagination } from '../grid/grid-pagination';
import {
  DEFAULT_ADMIN_STATE,
  resolveAdminAvailability,
  resolveAdminSort,
  resolveAdminState,
} from '../grid/grid-query';
import { GridCardTemplate, GridRowTemplate } from '../grid/grid-templates';
import { GridTimestamp } from '../grid/grid-timestamp';
import { RecordRow } from '../records/record-row';
import { AdminListHeader } from '../list-header';
import { DocumentsService } from '../documents/documents.service';
import { TiersService } from '../tiers/tiers.service';
import { ProductDeleteDialog } from './product-delete-dialog';
import { ProductRowActions, ProductRowState } from './product-row-actions';

/**
 * The admin product list: every product including soft-deleted ones
 * (which the storefront never shows), each with edit and delete/restore actions.
 * This is where deletion is reversible — the public catalog only ever hides
 * deleted rows, so restoring one lives here rather than on the storefront.
 * Admin-only and client-rendered like the rest of the panel.
 */
@Component({
  selector: 'app-product-list-page',
  imports: [
    RouterLink,
    PricePipe,
    AdminIcon,
    Button,
    ProductDeleteDialog,
    ProductRowActions,
    AdminListHeader,
    AdminGrid,
    GridRowTemplate,
    GridCardTemplate,
    GridPagination,
    GridTimestamp,
    Skeleton,
    StatusBadge,
    RecordRow,
  ],
  template: `
    <app-admin-list-header
      [title]="text.title"
      [query]="query() ?? ''"
      [searchLabel]="text.searchLabel"
      [searchPlaceholder]="text.searchPlaceholder"
      [clearSearchLabel]="text.clearSearch"
      [filtered]="filtered()"
      [narrowBelow]="narrowBelow"
    >
      <a
        appButton
        routerLink="/admin/products/new"
        [queryParams]="editorFrom()"
        class="gap-2"
      >
        <app-admin-icon name="plus" class="h-4 w-4" />
        {{ editText.addProduct }}
      </a>
    </app-admin-list-header>

    @if (products.error()) {
      <p class="text-muted" role="alert">{{ catalogText.loadError }}</p>
    } @else if (shown(); as data) {
      <app-admin-grid
        gridId="products"
        [columns]="columns()"
        [rows]="data.items"
        [trackBy]="bySlug"
        [muted]="isDeleted"
        [sort]="headerSort()"
        [defaultSortLabel]="catalogText.sort.relevance"
        [chips]="chips()"
        [busy]="products.isLoading()"
        [filtered]="filtered()"
        [narrowBelow]="narrowBelow"
        [emptyMessage]="filtered() ? text.noResults : text.empty"
      >
        <ng-template appGridRow [of]="data.items" let-item>
          <td>
            <div
              class="h-10 w-10 overflow-hidden rounded border border-border bg-stone-100"
            >
              @if (item.thumb) {
                <img
                  [src]="item.thumb"
                  alt=""
                  class="h-full w-full object-cover"
                />
              }
            </div>
          </td>
          <td>
            <!-- The sync key beside the name, dropping under it where the
                 column is too narrow to hold both: it is this product's
                 identifier, the same grey chip the tiers and the attribute
                 definitions wear for theirs. It is shown because the search box
                 matches it, not because it is worth a column of its own. -->
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span class="line-clamp-2 wrap-break-word text-subtle">
                <!-- The name goes to the product as a customer sees it; the
                     pencil in the actions column is the way into the editor.
                     Except where there is no such page — the storefront 404s a
                     product that is unpublished or deleted, and the badge
                     beside the name says which — so those rows keep the editor
                     as their destination. -->
                <a
                  [routerLink]="storefrontOrEditor(item)"
                  [queryParams]="editorFrom()"
                  class="font-medium text-stone-700 hover:text-accent"
                >
                  {{ item.name }}
                </a>
              </span>
              <span
                class="max-w-full truncate rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs"
                [title]="item.sourceId"
                >{{ item.sourceId }}</span
              >
            </div>
          </td>
          <td>
            <div class="flex items-center">
              <span class="line-clamp-2 wrap-break-word text-subtle">
                {{ categoryName().get(item.categoryId) }}
              </span>
            </div>
          </td>
          <td data-keep>
            <span appStatusBadge [tone]="stateTone(item)">
              {{ stateLabel(item) }}
            </span>
          </td>
          <td>
            <!-- The figure inside the badge, not the word: what a manager
                 restocking needs is how many, and the colour is what the three
                 states are for. The word is read out with it, so the colour is
                 never carrying the state on its own.

                 The unit is spelled out because the figure is not the only
                 count in the row: packaging is entered in pieces per pack and
                 packs per box, and a bare number in a stock column had to be
                 taken on trust as one of them. Non-breaking, so the two never
                 land on separate lines in the card. -->
            @if (item.stockPieces === null) {
              <span class="text-muted">{{ text.stockUntracked }}</span>
            } @else {
              <span
                appStatusBadge
                variant="dot"
                [tone]="stockTone(item)"
                [attr.aria-label]="stockLabel(item)"
              >
                {{ item.stockPieces }}&nbsp;{{ pieceSuffix }}
              </span>
            }
          </td>
          <td class="text-stone-700">
            {{ item.priceMinor | price }}
          </td>
          <td class="text-subtle">
            <app-grid-timestamp [value]="item.updatedAt" />
          </td>
          <td data-keep>
            <app-product-row-actions
              [product]="item"
              [returnParams]="editorFrom()"
              [busy]="publishing() === item.slug"
              (publishToggled)="togglePublished($event)"
              (restored)="restore($event)"
              (deleteRequested)="deletingProduct.set($event)"
            />
          </td>
        </ng-template>

        <!-- The same product on a phone: the photo stays, because it is the
             fastest way to recognise one, and the two identifiers a manager
             works from — the name and the sync key — sit beside it with the
             price. The category and the exact minute of the last change are
             detail for the editor. -->
        <ng-template appGridCard [of]="data.items" let-item>
          <!-- Only the product is greyed once it is deleted, never the badge
               that says so nor the buttons that undo it — the same rule the
               table follows cell by cell. -->
          <app-record-row>
            <div
              recordLead
              class="h-14 w-14 shrink-0 overflow-hidden rounded border border-border bg-stone-100"
              [class.opacity-50]="isDeleted(item)"
            >
              @if (item.thumb) {
                <img
                  [src]="item.thumb"
                  alt=""
                  class="h-full w-full object-cover"
                />
              }
            </div>
            <a
              [routerLink]="storefrontOrEditor(item)"
              [queryParams]="editorFrom()"
              class="font-medium wrap-break-word line-clamp-2 text-stone-700"
              [class.opacity-50]="isDeleted(item)"
            >
              {{ item.name }}
            </a>
            <span
              recordBadge
              appStatusBadge
              class="shrink-0"
              [tone]="stateTone(item)"
              >{{ stateLabel(item) }}</span
            >
            <span
              class="max-w-full truncate rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs"
              [class.opacity-50]="isDeleted(item)"
              >{{ item.sourceId }}</span
            >
            <ng-container recordMeta>
              <span class="text-stone-700" [class.opacity-50]="isDeleted(item)">
                {{ item.priceMinor | price }}
              </span>
              @if (item.stockPieces !== null) {
                <span
                  appStatusBadge
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
              (deleteRequested)="deletingProduct.set($event)"
            />
          </app-record-row>
        </ng-template>
      </app-admin-grid>

      <app-grid-pagination [pagination]="data.pagination" />
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }

    @if (deletingProduct(); as target) {
      <app-product-delete-dialog
        [slug]="target.slug"
        [name]="target.name"
        (deleted)="onProductDeleted()"
        (cancelled)="deletingProduct.set(null)"
      />
    }
  `,
})
export class ProductListPage {
  private readonly admin = inject(AdminCatalogService);
  private readonly attributes = inject(AttributesService);
  private readonly tierService = inject(TiersService);
  private readonly documentService = inject(DocumentsService);
  private readonly router = inject(Router);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productList;
  protected readonly editText = inject(ADMIN_TEXT).editMode;
  private readonly confirm = inject(ConfirmService);
  protected readonly productText = inject(ADMIN_TEXT).productEditor;
  protected readonly catalogText = inject(APP_TEXT).catalog;
  /** The storefront's three words for a stock state, reused rather than
   * restated: the grid and the badge a customer sees name one fact. */
  protected readonly availabilityText = this.catalogText.availability;
  protected readonly editorFrom = injectEditorReturnParams();

  /** Bound from the `page` query param (a string); coerced and floored to 1. */
  page = input('1');
  protected currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

  /*
   * The rest of the grid's state, likewise bound from query parameters
   * (FR-ADM-05) — the inputs are named for the parameters, since router input
   * binding matches on the parameter's name. Each is narrowed before it reaches
   * the API, so a hand-edited URL falls back to the default instead of becoming
   * a request the server would reject.
   */
  readonly searchTerm = input('');
  protected readonly query = computed(() =>
    this.searchTerm() ? this.searchTerm().trim() : undefined,
  );

  readonly sort = input('');
  protected readonly sortKey = computed(() => resolveAdminSort(this.sort()));
  /**
   * The sort as the column headings should show it. `relevance` is not a column
   * — with a query it is the text ranking, and with none the API falls back to
   * state order, so that is the header to light up. Display only: the request
   * still sends the key that was resolved.
   */
  protected readonly headerSort = computed<AdminProductSort | null>(() => {
    if (this.sortKey() !== 'relevance') return this.sortKey();
    return this.query() ? null : 'state';
  });

  readonly state = input('');
  protected readonly stateKey = computed(() => resolveAdminState(this.state()));
  /** The select's value: the default is the unfiltered choice, whose option
   * carries the empty value that clears the parameter. */
  protected readonly stateParam = computed(() =>
    this.stateKey() === DEFAULT_ADMIN_STATE ? '' : this.stateKey(),
  );

  /**
   * One of the three stock states, or empty for any (FR-ADM-05). Not narrowed
   * here: a value that is not one of them fails contract validation, which is
   * the same answer a hand-edited URL deserves anywhere else in this grid.
   */
  readonly availability = input('');
  protected readonly availabilityKey = computed(() =>
    resolveAdminAvailability(this.availability()),
  );

  /** Not narrowed here — an unknown id is a uuid the API answers with an empty
   * page, and anything that is not one fails contract validation. */
  readonly categoryId = input('');

  /**
   * Where the attribute inventory drills down to (FR-ATTR-09): the products
   * carrying one attribute key, optionally narrowed to one of its values. It
   * has no column of its own — attributes are not in the grid — so it is shown
   * as a chip above the table, which is also how it is cleared.
   */
  readonly attributeKey = input('');
  readonly attributeValue = input('');

  /**
   * Where the tier list's price count drills down to: the products this tier
   * has a price of its own for. Like the attribute filter it has no column —
   * the grid shows the base price, not a tier's — so it is a chip too.
   */
  readonly tierId = input('');
  /**
   * Where the document list's product count drills down to: the products one
   * certificate, declaration or data sheet is shown on (FR-DOC-02). A chip
   * like the two above — a product row says nothing about its documents.
   */
  readonly documentId = input('');
  /** The document, for the chip's title alone — fetched only while the chip is
   * on screen, and a failure leaves the chip absent rather than the list
   * broken, exactly as the tier's does. */
  private readonly documents = resource({
    params: () => (this.documentId() ? { id: this.documentId() } : undefined),
    loader: ({ params }) =>
      this.documentService.get(params.id).catch(() => undefined),
  });
  protected readonly documentFilter = computed(
    () => this.documents.value()?.title ?? null,
  );
  /** The tiers, for the chip's name alone: fetched only while a chip is on
   * screen, and a failure leaves the chip absent rather than the list broken. */
  private readonly tiers = resource({
    params: () => (this.tierId() ? { id: this.tierId() } : undefined),
    loader: () =>
      this.tierService.list().then(
        (r) => r.tiers,
        () => [],
      ),
  });
  /** The tier's own label, or null until it is known. The chip waits for the
   * name rather than showing a uuid nobody can read. */
  protected readonly tierFilter = computed(() => {
    const id = this.tierId();
    if (!id) return null;
    return (this.tiers.value() ?? []).find((t) => t.id === id)?.label ?? null;
  });
  /**
   * The registry, for the chip's unit alone — so it is fetched only while a
   * chip is on screen, and a failure leaves the chip unadorned rather than
   * breaking the list.
   */
  private readonly definitions = resource({
    params: () =>
      this.attributeKey() ? { key: this.attributeKey() } : undefined,
    loader: () => this.attributes.list().catch(() => []),
  });

  /**
   * The value only qualifies a key; on its own there is nothing to show. The
   * value is shown with the declared unit, as the storefront's chips and the
   * spec table show it — the inventory, which is where values are *edited*,
   * keeps showing them exactly as stored.
   */
  protected readonly attributeFilter = computed(() => {
    const key = this.attributeKey();
    if (!key) return null;
    const unit =
      (this.definitions.value() ?? []).find((d) => d.name === key)?.unit ??
      null;
    const value = this.attributeValue();
    return { key, value: value ? formatAttributeValue(value, unit) : null };
  });

  /** Whether anything is narrowing the list, which is what separates "no
   * products" from "no matches". */
  protected readonly filtered = computed(
    () =>
      !!this.query() ||
      !!this.categoryId() ||
      !!this.availabilityKey() ||
      !!this.attributeFilter() ||
      !!this.tierId() ||
      !!this.documentId() ||
      this.stateKey() !== DEFAULT_ADMIN_STATE,
  );

  private readonly categories = resource({
    loader: () => this.admin.listCategories(),
  });
  protected readonly categoryName = computed(
    () => new Map((this.categories.value() ?? []).map((c) => [c.id, c.name])),
  );

  /** The category filter's options: the tree flattened depth-first and
   * indented, same as the editor's picker, led by the unfiltered choice. */
  protected readonly categoryOptions = computed<GridFilterOption[]>(() => [
    { value: '', label: this.text.allCategories },
    ...flattenCategoryTree(this.categories.value() ?? []).map((node) => ({
      value: node.category.id,
      label: node.category.name,
      depth: node.depth,
    })),
  ]);

  /**
   * The columns, declared once: the headings on a desktop, the filter sheet and
   * the sort picker on a phone, and the widths an admin drags. A computed
   * because two of them carry the filter values in effect.
   */
  protected readonly columns = computed<GridColumn[]>(() => [
    // A photo and a row of glyphs need what they need; the rest of the table
    // divides what those two leave.
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
        value: this.categoryId(),
        ariaLabel: this.text.filterCategory,
      },
    },
    // Both a filter and a sort, like the order list's status: what the grid is
    // narrowed by is also what an admin wants at the top when they open it.
    {
      key: 'state',
      label: this.text.stateAll,
      sortName: this.text.state,
      sort: { asc: 'state', desc: 'state_desc' },
      filter: {
        param: 'state',
        options: this.stateOptions,
        value: this.stateParam(),
        ariaLabel: this.text.filterState,
      },
      minWidth: 120,
    },
    // Filtered but not sorted: the storefront leads every listing with
    // availability (FR-STOCK-05), and the grid answers the same question the
    // other way round — "show me only what is out" — because a manager is
    // working through a list, not shopping in it.
    {
      key: 'stock',
      label: this.text.stockAll,
      sortName: this.text.stock,
      filter: {
        param: 'availability',
        options: this.stockOptions,
        value: this.availabilityKey() ?? '',
        ariaLabel: this.text.filterStock,
      },
      minWidth: 110,
    },
    {
      key: 'price',
      label: this.productText.price,
      sort: { asc: 'price', desc: 'price_desc' },
      minWidth: 90,
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

  /**
   * The narrowings the table has no heading for, each arrived at from the
   * screen that asks the question — the attribute inventory, the tier list,
   * the document list.
   * The grid shows them as chips and counts them with its own filters, so a
   * phone can see and undo them without a column to hang them on.
   */
  protected readonly chips = computed<GridChip[]>(() => {
    const chips: GridChip[] = [];
    const tier = this.tierFilter();
    if (tier) {
      chips.push({
        label: this.text.filterTier,
        value: tier,
        clearParams: { tierId: null, page: null },
        clearLabel: this.text.clearTier,
      });
    }
    const document = this.documentFilter();
    if (document) {
      chips.push({
        label: this.text.filterDocument,
        value: document,
        clearParams: { documentId: null, page: null },
        clearLabel: this.text.clearDocument,
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
        clearLabel: this.text.clearAttribute,
      });
    }
    return chips;
  });

  /**
   * The stock column is the seventh thing in a row that already carries a
   * photo, a name with its sync key, a category, a state, a price and a
   * timestamp — the same wall of truncation the customer list gives up on a
   * breakpoint early, so this one now does too.
   */
  protected readonly narrowBelow = 'lg' as const;

  protected readonly bySlug = (item: { slug: string }): string => item.slug;

  /** A deleted product is still listed — this is where undeleting happens — but
   * greyed, since it is not part of the catalogue while it is there. An
   * unpublished one is not greyed: it is waiting for somebody, which is work. */
  protected readonly isDeleted = (item: {
    deletedAt: string | null;
  }): boolean => !!item.deletedAt;

  /** Where a product stands, as its own column: deleted, waiting to be
   * published, or on the storefront. The same three words the filter offers, so
   * a narrowed list and its rows cannot describe the same state differently. */
  protected stateLabel(item: {
    deletedAt: string | null;
    publishedAt: string | null;
  }): string {
    if (item.deletedAt) return this.text.stateDeleted;
    return item.publishedAt ? this.text.stateLive : this.text.stateUnpublished;
  }

  protected stateTone(item: {
    deletedAt: string | null;
    publishedAt: string | null;
  }): StatusTone {
    if (item.deletedAt) return 'danger';
    return item.publishedAt ? 'ok' : 'waiting';
  }

  /** The badge's colour, the storefront's own: green for what is there, amber
   * for what is nearly gone, grey for an empty shelf. Never red — an empty
   * shelf is a fact, not a fault of the row. */
  protected stockTone(item: { availability: ProductAvailability | null }) {
    const tones: Record<ProductAvailability, StatusTone> = {
      in: 'ok',
      low: 'waiting',
      out: 'neutral',
    };
    return tones[item.availability ?? 'in'];
  }

  /** The editor's own word for a piece, not a second spelling of it: a
   * deployment that says "ea" or "St." says it once. */
  protected readonly pieceSuffix = this.productText.packaging.pieceSuffix;

  /** What the badge says when it is read rather than seen: the figure and the
   * state it resolves to. The unit is in the wording of `stockLabel`, so the
   * suffix beside the figure is not read out twice. */
  protected stockLabel(item: {
    stockPieces: number | null;
    availability: ProductAvailability | null;
  }): string {
    return fillText(this.text.stockLabel, {
      count: String(item.stockPieces ?? 0),
      state: this.availabilityText[item.availability ?? 'in'],
    });
  }

  /** Where a row's name goes: the storefront page for a product a customer can
   * see, the editor for one they cannot. */
  protected storefrontOrEditor(item: {
    slug: string;
    publishedAt: string | null;
    deletedAt: string | null;
  }): string[] {
    return item.publishedAt && !item.deletedAt
      ? ['/product', item.slug]
      : ['/admin/products', item.slug, 'edit'];
  }

  /**
   * The three states, in the order a manager reads them — what is gone first,
   * because that is the list they came to act on. The words are the
   * storefront's own, so a grid row and a product page cannot describe one
   * stock in two vocabularies.
   */
  protected readonly stockOptions: GridFilterOption[] = [
    { value: '', label: this.text.stockAll },
    { value: 'out', label: this.availabilityText.out },
    { value: 'low', label: this.availabilityText.low },
    { value: 'in', label: this.availabilityText.in },
  ];

  protected readonly stateOptions: GridFilterOption[] = [
    { value: '', label: this.text.stateAll },
    { value: 'live', label: this.text.stateLive },
    { value: 'unpublished', label: this.text.stateUnpublished },
    { value: 'deleted', label: this.text.stateDeleted },
  ];

  protected products = resource({
    params: () => ({
      page: this.currentPage(),
      q: this.query(),
      sort: this.sortKey(),
      state: this.stateKey(),
      availability: this.availabilityKey(),
      categoryId: this.categoryId() || undefined,
      attributeKey: this.attributeKey() || undefined,
      attributeValue: this.attributeValue() || undefined,
      tierId: this.tierId() || undefined,
      documentId: this.documentId() || undefined,
    }),
    loader: ({ params }) => this.admin.listProducts(params),
  });

  /** Held across reloads, so filtering, sorting or typing swaps the rows
   * instead of blanking the table — and the header that carries the controls
   * stays put while the next page is in flight. */
  protected readonly shown = stableValue(this.products);

  /** Delayed so a quick load never flashes a skeleton. Only the first load can
   * reach it — a reload still has the previous rows on screen. */
  protected readonly showSkeleton = delayedLoading(this.products.isLoading);

  /** The product whose delete confirmation modal is open, if any. */
  protected readonly deletingProduct = signal<{
    slug: string;
    name: string;
  } | null>(null);

  protected onProductDeleted(): void {
    this.deletingProduct.set(null);
    this.products.reload();
  }

  protected readonly publishing = signal<string | null>(null);

  /**
   * Publishing is one click; unpublishing is confirmed, because taking a
   * product off sale is the same weight as deleting it.
   */
  protected async togglePublished(item: ProductRowState): Promise<void> {
    const publish = item.publishedAt === null;
    if (
      !publish &&
      !(await this.confirm.ask({
        heading: this.editText.unpublishProduct,
        message: this.editText.unpublishConfirm.replace('{name}', item.name),
        confirmLabel: this.editText.unpublishProduct,
        cancelLabel: this.common.cancel,
        confirmVariant: 'danger',
      }))
    ) {
      return;
    }
    this.publishing.set(item.slug);
    try {
      await this.admin.setProductPublished(item.slug, publish);
      this.products.reload();
    } finally {
      this.publishing.set(null);
    }
  }

  protected async restore(item: ProductRowState): Promise<void> {
    await this.admin.restoreProduct(item.slug);
    this.products.reload();
  }

  constructor() {
    // Admin screens are client-rendered, so this is for the browser tab
    // rather than for crawlers — but it is the same one-line contract.
    usePageSeo({ name: () => this.text.title });
  }
}
