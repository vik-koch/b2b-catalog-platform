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
  formatAttributeValue,
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
  resolveAdminSort,
  resolveAdminState,
} from '../grid/grid-query';
import { GridCardTemplate, GridRowTemplate } from '../grid/grid-templates';
import { GridTimestamp } from '../grid/grid-timestamp';
import { AdminListHeader } from '../list-header';
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
  ],
  template: `
    <app-admin-list-header
      [title]="text.title"
      [query]="query() ?? ''"
      [searchLabel]="text.searchLabel"
      [searchPlaceholder]="text.searchPlaceholder"
      [clearSearchLabel]="text.clearSearch"
      [filtered]="filtered()"
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
            <div class="flex items-center">
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
            </div>
            <!-- The sync key under the name, as the account lists put the email
                 under the person: it is shown because the search box matches it,
                 not because it is worth a column of its own. Monospaced — an
                 identifier to compare character by character, not prose — and
                 truncated, since a legacy key can be long. -->
            <span
              class="block truncate font-mono text-xs text-subtle"
              [title]="item.sourceId"
              >{{ item.sourceId }}</span
            >
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
          <div class="flex gap-3">
            <div
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
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-3">
                <a
                  [routerLink]="storefrontOrEditor(item)"
                  [queryParams]="editorFrom()"
                  class="font-medium wrap-break-word line-clamp-2 text-stone-700"
                  [class.opacity-50]="isDeleted(item)"
                >
                  {{ item.name }}
                </a>
                <span
                  appStatusBadge
                  class="shrink-0"
                  [tone]="stateTone(item)"
                  >{{ stateLabel(item) }}</span
                >
              </div>
              <p
                class="mt-0.5 flex items-baseline gap-2 truncate text-xs text-subtle"
                [class.opacity-50]="isDeleted(item)"
              >
                <span class="truncate font-mono">{{ item.sourceId }}</span>
                <app-grid-timestamp [value]="item.updatedAt" inline />
              </p>
              <div class="mt-1 flex items-center justify-between gap-3">
                <span
                  class="text-stone-700"
                  [class.opacity-50]="isDeleted(item)"
                  >{{ item.priceMinor | price }}</span
                >
                <app-product-row-actions
                  class="shrink-0"
                  [product]="item"
                  [returnParams]="editorFrom()"
                  [busy]="publishing() === item.slug"
                  (publishToggled)="togglePublished($event)"
                  (restored)="restore($event)"
                  (deleteRequested)="deletingProduct.set($event)"
                />
              </div>
            </div>
          </div>
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
  private readonly router = inject(Router);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productList;
  protected readonly editText = inject(ADMIN_TEXT).editMode;
  private readonly confirm = inject(ConfirmService);
  protected readonly productText = inject(ADMIN_TEXT).productEditor;
  protected readonly catalogText = inject(APP_TEXT).catalog;
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
      !!this.attributeFilter() ||
      !!this.tierId() ||
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
   * The two narrowings the table has no heading for, each arrived at from the
   * screen that asks the question — the attribute inventory, the tier list.
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
      categoryId: this.categoryId() || undefined,
      attributeKey: this.attributeKey() || undefined,
      attributeValue: this.attributeValue() || undefined,
      tierId: this.tierId() || undefined,
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
