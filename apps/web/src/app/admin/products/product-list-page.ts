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
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { ConfirmService } from '../../ui/confirm.service';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { usePageSeo } from '../../core/page-seo';
import { Skeleton } from '../../ui/skeleton';
import { delayedLoading } from '../../core/delayed-loading';
import { stableValue } from '../../core/stable-value';
import { PricePipe } from '../../catalog/price.pipe';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { AdminCatalogService } from '../admin-catalog.service';
import { AttributesService } from '../attributes/attributes.service';
import { TiersService } from '../tiers/tiers.service';
import { flattenCategoryTree } from '../categories/category-tree';
import { injectEditorReturnParams } from '../editor-return';
import { GridFilterOption, GridFilterSelect } from './grid-filter-select';
import {
  DEFAULT_ADMIN_STATE,
  resolveAdminSort,
  resolveAdminState,
} from './grid-query';
import { GridSortHeader } from './grid-sort-header';
import { ProductDeleteDialog } from './product-delete-dialog';
import { AdminListHeader } from '../list-header';
import { StatusBadge } from '../../ui/status-badge';

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
    Button,
    AdminIcon,
    ProductDeleteDialog,
    AdminListHeader,
    GridSortHeader,
    GridFilterSelect,
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
        [queryParams]="editorFrom"
        class="gap-2"
      >
        <app-admin-icon name="plus" class="h-4 w-4" />
        {{ editText.addProduct }}
      </a>
    </app-admin-list-header>

    <!-- The two filters with no column to live in say what they are doing
         here and carry their own way out. Each is arrived at from the screen
         that asks the question — the attribute inventory, the tier list. -->
    @if (tierFilter(); as tier) {
      <p class="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span
          class="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1"
        >
          <span class="text-subtle">{{ text.filterTier }}</span>
          <span class="font-medium">{{ tier }}</span>
          <a
            routerLink="."
            [queryParams]="{ tierId: null, page: null }"
            queryParamsHandling="merge"
            class="flex items-center justify-center cursor-pointer rounded-full p-0.5 text-stone-400 hover:text-red-700"
            [attr.aria-label]="text.clearTier"
          >
            <app-admin-icon name="x" class="h-3.5 h-3.5" />
          </a>
        </span>
      </p>
    }

    @if (attributeFilter(); as attribute) {
      <p class="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span
          class="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1"
        >
          <span class="text-subtle">{{ text.filterAttribute }}</span>
          <span class="font-medium">{{ attribute.key }}</span>
          @if (attribute.value) {
            <span class="font-medium">= {{ attribute.value }}</span>
          }
          <a
            routerLink="."
            [queryParams]="{
              attributeKey: null,
              attributeValue: null,
              page: null,
            }"
            queryParamsHandling="merge"
            class="flex items-center justify-center cursor-pointer rounded-full p-0.5 text-stone-400 hover:text-red-700"
            [attr.aria-label]="text.clearAttribute"
          >
            <app-admin-icon name="x" class="h-3.5 h-3.5" />
          </a>
        </span>
      </p>
    }

    @if (products.error()) {
      <p class="text-muted" role="alert">{{ catalogText.loadError }}</p>
    } @else if (shown(); as data) {
      <!-- The table renders even with no rows: its header carries the filters
           that produced the empty result, and taking them away with the rows
           would leave nothing to undo them with. -->
      <table
        class="w-full text-sm table-fixed [&_th,&_td]:py-2 [&_th,&_td]:pr-4 [&_th:last-child,&_td:last-child]:pr-0"
        [attr.aria-busy]="products.isLoading() ? 'true' : null"
      >
        <thead>
          <tr class="border-b border-border text-left text-subtle">
            <th class="w-10"></th>
            <th class="w-70 pl-2">
              <app-grid-sort
                asc="name"
                desc="name_desc"
                [label]="productText.name"
                [sort]="headerSort()"
              />
            </th>
            <th class="font-medium w-20">{{ text.sourceId }}</th>
            <th class="font-medium w-50">
              <app-grid-filter-select
                param="categoryId"
                [options]="categoryOptions()"
                [value]="categoryId()"
                [ariaLabel]="text.filterCategory"
              />
            </th>
            <th class="w-20">
              <app-grid-sort
                asc="price"
                desc="price_desc"
                [label]="productText.price"
                [sort]="headerSort()"
              />
            </th>
            <th class="w-20">
              <app-grid-sort
                asc="updated"
                desc="updated_desc"
                [label]="text.updated"
                [descFirst]="true"
                [sort]="headerSort()"
              />
            </th>
            <th class="font-medium w-10">
              <app-grid-filter-select
                param="state"
                [options]="stateOptions"
                [value]="stateParam()"
                [ariaLabel]="text.filterState"
              />
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-stone-100">
          @for (item of data.items; track item.slug) {
            <tr [class.opacity-50]="item.deletedAt">
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
              <td class="pl-2">
                <div class="flex items-center">
                  <span class="line-clamp-2 wrap-break-word text-subtle">
                    @if (item.deletedAt) {
                      <span appStatusBadge class="mr-2">
                        {{ text.deletedBadge }}
                      </span>
                    } @else if (!item.publishedAt) {
                      <span appStatusBadge tone="waiting" class="mr-2">
                        {{ text.unpublishedBadge }}
                      </span>
                    }
                    <!-- The name goes to the product as a customer sees it;
                         the pencil in the actions column is the way into the
                         editor. Except where there is no such page — the
                         storefront 404s a product that is unpublished or
                         deleted, and the badge beside the name says which —
                         so those rows keep the editor as their destination. -->
                    <a
                      [routerLink]="
                        item.publishedAt && !item.deletedAt
                          ? ['/product', item.slug]
                          : ['/admin/products', item.slug, 'edit']
                      "
                      [queryParams]="editorFrom"
                      class="font-medium text-stone-700 hover:text-accent"
                    >
                      {{ item.name }}
                    </a>
                  </span>
                </div>
              </td>
              <td class="text-subtle">
                <!-- The sync key, shown because the search box matches it: an
                     admin who searched for a key should see the key they
                     found. Monospaced — an identifier to compare character by
                     character, not prose — and truncated, since a legacy key
                     can be long and the full value is one hover away. -->
                <span
                  class="block max-w-20 truncate font-mono text-xs"
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
              <td class="text-stone-700">
                {{ item.priceMinor | price }}
              </td>
              <td class="py-2 text-subtle ">
                <div>{{ formatTime(item.updatedAt) }}</div>
                <div class="text-[0.675rem]">
                  {{ formatDate(item.updatedAt) }}
                </div>
              </td>
              <td>
                <div class="flex items-center justify-end gap-1">
                  <a
                    [routerLink]="['/admin/products', item.slug, 'edit']"
                    [queryParams]="editorFrom"
                    class="p-1.5 text-subtle hover:text-accent"
                    [attr.aria-label]="editText.editProduct"
                    [title]="editText.editProduct"
                  >
                    <app-admin-icon name="pencil" class="h-4 w-4" />
                  </a>
                  <!-- Publication is independent of deletion, so a deleted row
                       still shows where it stands: restoring it does not put it
                       back on the storefront by itself. -->
                  <button
                    type="button"
                    class="p-1.5 text-subtle hover:text-accent"
                    [disabled]="publishing() === item.slug"
                    [attr.aria-label]="publishLabel(item)"
                    [title]="publishLabel(item)"
                    (click)="togglePublished(item)"
                  >
                    <app-admin-icon
                      [name]="item.publishedAt ? 'book-dashed' : 'book-check'"
                      class="h-4 w-4"
                    />
                  </button>
                  @if (item.deletedAt) {
                    <button
                      type="button"
                      class="p-1.5 text-subtle hover:text-accent"
                      [attr.aria-label]="common.restore"
                      [title]="common.restore"
                      (click)="restore(item)"
                    >
                      <app-admin-icon name="rotate-ccw" class="h-4 w-4" />
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="p-1.5 text-subtle hover:text-red-700"
                      [attr.aria-label]="editText.deleteProduct"
                      [title]="editText.deleteProduct"
                      (click)="deletingProduct.set(item)"
                    >
                      <app-admin-icon name="trash-2" class="h-4 w-4" />
                    </button>
                  }
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (data.items.length === 0) {
        <!-- Two different nothings: an empty catalogue is a state to fix by
             adding a product, an empty result is one to fix by widening the
             filters — so they cannot share a sentence. -->
        <p class="mt-6 text-muted">
          {{ filtered() ? text.noResults : text.empty }}
        </p>
      }

      @if (data.pagination.totalPages > 1) {
        <nav
          class="mt-8 flex items-center justify-center gap-4 text-sm"
          [attr.aria-label]="catalogText.pageStatus"
        >
          <!-- Every page link merges: the filters, the search and the sort are
               all in the URL now, and a link carrying page alone would drop
               them and page through a different list than the one on screen. -->
          @if (data.pagination.page > 1) {
            <a
              routerLink="/admin/products"
              [queryParams]="{ page: data.pagination.page - 1 }"
              queryParamsHandling="merge"
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
              routerLink="/admin/products"
              [queryParams]="{ page: data.pagination.page + 1 }"
              queryParamsHandling="merge"
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

  /** Built once: a formatter is expensive to construct and the grid renders one
   * date per row. Date only — the grid is scanned, and a row's exact minute is
   * detail for the editor rather than for the list. */
  private readonly dateFormat = new Intl.DateTimeFormat(
    inject(DEPLOYMENT_CONFIG).catalog.currency.locale,
    { dateStyle: 'medium' },
  );

  private readonly timeFormat = new Intl.DateTimeFormat(
    inject(DEPLOYMENT_CONFIG).catalog.currency.locale,
    { timeStyle: 'medium' },
  );

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
   * — with a query it is the ranking, and with none the API orders by name, so
   * that is the header to light up. Display only: the request still sends the
   * key that was resolved.
   */
  protected readonly headerSort = computed<AdminProductSort | null>(() => {
    if (this.sortKey() !== 'relevance') return this.sortKey();
    return this.query() ? null : 'name';
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

  /** Names what the button would do, for both the tooltip and screen readers. */
  protected publishLabel(item: { publishedAt: string | null }): string {
    return item.publishedAt
      ? this.editText.unpublishProduct
      : this.editText.publishProduct;
  }

  /**
   * Publishing is one click; unpublishing is confirmed, because taking a
   * product off sale is the same weight as deleting it.
   */
  protected async togglePublished(item: {
    slug: string;
    name: string;
    publishedAt: string | null;
  }): Promise<void> {
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

  protected async restore(item: { slug: string }): Promise<void> {
    await this.admin.restoreProduct(item.slug);
    this.products.reload();
  }

  /** Dates follow the deployment's locale, like prices do. */
  protected formatDate(iso: string): string {
    return this.dateFormat.format(new Date(iso));
  }

  protected formatTime(iso: string): string {
    return this.timeFormat.format(new Date(iso));
  }

  protected pageStatus(p: { page: number; totalPages: number }): string {
    return this.catalogText.pageStatus
      .replace('{page}', String(p.page))
      .replace('{total}', String(p.totalPages));
  }

  constructor() {
    // Admin screens are client-rendered, so this is for the browser tab
    // rather than for crawlers — but it is the same one-line contract.
    usePageSeo({ name: () => this.text.title });
  }
}
