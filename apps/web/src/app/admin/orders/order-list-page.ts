import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  OrderStatus,
  orderStatusSchema,
  StaffOrderSort,
  staffOrderSortSchema,
} from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../../catalog/price';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { stableValue } from '../../core/stable-value';
import { Skeleton } from '../../ui/skeleton';
import { StatusBadge, StatusTone } from '../../ui/status-badge';
import { orderStatusTone } from '../../orders/order-status';
import { AdminListHeader } from '../list-header';
import { AdminGrid } from '../grid/admin-grid';
import { GridColumn } from '../grid/grid-column';
import { GridFilterOption } from '../grid/grid-filter-select';
import { GridPagination } from '../grid/grid-pagination';
import { GridCardTemplate, GridRowTemplate } from '../grid/grid-templates';
import { GridTimestamp } from '../grid/grid-timestamp';
import { AdminOrdersService, StaffOrderSummary } from './orders.service';

/**
 * Every order request, for staff (FR-AUTH-03). Read-only: an order is answered
 * by phone or mail, and the status transitions that will move it are not here
 * yet.
 *
 * Newest first, narrowed by the status and by the find-an-order box — the two
 * questions a manager opens this list with: "what have I not answered yet?"
 * and "where is the one they are asking about on the phone?". Both are query
 * parameters like every other grid's, so a narrowed list is shareable and
 * survives a reload, and both are applied server-side: the list is paged, and
 * a box that filtered one page would be a lie.
 */
@Component({
  selector: 'app-admin-order-list-page',
  imports: [
    RouterLink,
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
      [query]="query()"
      [searchLabel]="text.searchLabel"
      [searchPlaceholder]="text.searchPlaceholder"
      [clearSearchLabel]="text.clearSearch"
      [filtered]="filtered()"
    />

    @if (orders.error()) {
      <p class="text-muted" role="alert">{{ text.loadError }}</p>
    } @else if (shown(); as data) {
      <app-admin-grid
        gridId="orders"
        [columns]="columns()"
        [rows]="data.items"
        [trackBy]="byReference"
        [sort]="sortKey()"
        [defaultSort]="defaultSort"
        [muted]="isEnded"
        [busy]="orders.isLoading()"
        [filtered]="filtered()"
        [emptyMessage]="filtered() ? text.noResults : text.empty"
      >
        <ng-template appGridRow [of]="data.items" let-order>
          <td class="truncate font-medium">
            <a
              class="hover:text-accent"
              [routerLink]="['/admin/orders', order.reference]"
            >
              {{ order.reference }}
            </a>
          </td>
          <td class="text-subtle">
            <app-grid-timestamp [value]="order.createdAt" />
          </td>
          <!-- Who to call, and underneath the account it came from — or
               that it came from nobody, which is what a guest order is. -->
          <td class="truncate" [title]="order.customerEmail ?? ''">
            <span class="block truncate text-stone-700">
              {{ order.contactName }}
            </span>
            <span class="block truncate text-xs text-subtle">
              {{ order.customerEmail ?? text.guest }}
            </span>
          </td>
          <td data-keep>
            <span appStatusBadge [tone]="statusTone(order.status)">
              {{ statusLabel(order.status) }}
            </span>
          </td>
          <td class="truncate text-subtle">
            {{ lineCount(order.itemCount) }}
          </td>
          <td class="text-right tabular-nums">{{ total(order) }}</td>
        </ng-template>

        <!-- The same order on a phone: what it is and where it stands on the
             first line, who to call on the second, and the two figures a
             manager is looking for — when it came in and what it comes to — on
             the third. The account it came from is a detail for the order's own
             page; the name and the reference are what a phone call is about. -->
        <ng-template appGridCard [of]="data.items" let-order>
          <a
            class="block"
            [routerLink]="['/admin/orders', order.reference]"
            [attr.aria-label]="order.reference"
          >
            <!-- Only the order is greyed once it is over, never the badge that
                 says so — the same rule the table follows cell by cell. -->
            <div class="flex items-baseline justify-between gap-3">
              <span
                class="truncate font-medium"
                [class.opacity-50]="isEnded(order)"
                >{{ order.reference }}</span
              >
              <span appStatusBadge [tone]="statusTone(order.status)">
                {{ statusLabel(order.status) }}
              </span>
            </div>
            <div [class.opacity-50]="isEnded(order)">
              <p class="mt-1 truncate text-subtle">
                {{ order.contactName }}
              </p>
              <p class="mt-1 flex items-baseline justify-between gap-3 text-sm">
                <span class="flex min-w-0 items-baseline gap-1 text-subtle">
                  <app-grid-timestamp [value]="order.createdAt" inline />
                  <span class="truncate"
                    >· {{ lineCount(order.itemCount) }}</span
                  >
                </span>
                <span class="tabular-nums">{{ total(order) }}</span>
              </p>
            </div>
          </a>
        </ng-template>
      </app-admin-grid>

      <app-grid-pagination [pagination]="data.pagination" />
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }
  `,
})
export class AdminOrderListPage {
  private readonly api = inject(AdminOrdersService);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  protected readonly text = inject(ADMIN_TEXT).orderList;

  /** Bound from the query parameters; both are narrowed before they reach the
   * API, so a hand-edited URL falls back to the default view. */
  readonly page = input('1');
  readonly status = input('');
  /**
   * Named for the parameter it is bound from — router input binding matches on
   * the name, and the find-a-row box writes `searchTerm`. `q` is the navbar
   * search's own parameter and is never read here.
   */
  readonly searchTerm = input('');

  private readonly currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  protected readonly statusKey = computed<OrderStatus | undefined>(() => {
    const parsed = orderStatusSchema.safeParse(this.status());
    return parsed.success ? parsed.data : undefined;
  });
  /** The filter's own value: the empty string is "no filter", never undefined,
   * or the select falls back to its first option by accident rather than by
   * agreement. */
  protected readonly statusParam = computed(() => this.statusKey() ?? '');

  /**
   * The ordering, server-side like the filter: the list is paged, and sorting
   * one page would be sorting one twentieth of the orders. The default is
   * unanswered-first, which is the question this screen is opened with — so it
   * is the sort written as an *absent* parameter.
   */
  readonly sort = input('');
  protected readonly defaultSort: StaffOrderSort = 'status';
  protected readonly sortKey = computed<StaffOrderSort>(() => {
    const parsed = staffOrderSortSchema.safeParse(this.sort());
    return parsed.success ? parsed.data : this.defaultSort;
  });

  /**
   * Router input binding sets an *absent* parameter to undefined, whatever the
   * input's default says — so every one of these is read through a guard
   * rather than used straight. A page opened from the panel carries no
   * parameters at all.
   */
  protected readonly query = computed(() =>
    this.searchTerm() ? this.searchTerm().trim() : '',
  );
  protected readonly filtered = computed(
    () => !!this.statusKey() || !!this.query(),
  );

  protected readonly orders = resource({
    params: () => ({
      page: this.currentPage(),
      status: this.statusKey(),
      q: this.query() || undefined,
      sort: this.sortKey(),
    }),
    loader: ({ params }) => this.api.list(params),
  });

  /** Held across reloads, so filtering or paging swaps the rows instead of
   * blanking the table the filter sits in. */
  protected readonly shown = stableValue(this.orders);
  protected readonly showSkeleton = delayedLoading(this.orders.isLoading);

  /**
   * The columns, declared once: the headings on a desktop, the filter sheet and
   * the sort picker on a phone, and the widths an admin drags all read the same
   * list. A computed because the status filter's own value is part of it.
   */
  protected readonly columns = computed<GridColumn[]>(() => [
    { key: 'reference', label: this.text.reference, minWidth: 140 },
    {
      key: 'placed',
      label: this.text.placed,
      sort: { asc: 'placed', desc: 'placed_desc', descFirst: true },
      minWidth: 110,
    },
    { key: 'customer', label: this.text.customer, minWidth: 140 },
    {
      key: 'status',
      label: this.text.statusAll,
      sortName: this.text.status,
      // The one column that both filters and sorts: what a manager narrows by
      // is also what they want at the top when they open the list.
      sort: { asc: 'status', desc: 'status_desc' },
      filter: {
        param: 'status',
        options: this.statusOptions,
        value: this.statusParam(),
        ariaLabel: this.text.filterStatus,
      },
      minWidth: 110,
    },
    { key: 'items', label: this.text.items, minWidth: 80 },
    { key: 'total', label: this.text.total, align: 'right', minWidth: 90 },
  ]);

  protected readonly byReference = (order: StaffOrderSummary): string =>
    order.reference;

  /** An order nobody is going to act on again, greyed the way a deleted
   * product is: it is still listed, but it is not work. */
  protected readonly isEnded = (order: StaffOrderSummary): boolean =>
    order.status === 'declined' || order.status === 'cancelled';

  protected readonly statusOptions: GridFilterOption[] = [
    { value: '', label: this.text.statusAll },
    { value: 'requested', label: this.text.statusRequested },
    { value: 'approved', label: this.text.statusApproved },
    { value: 'declined', label: this.text.statusDeclined },
    { value: 'cancelled', label: this.text.statusCancelled },
  ];

  protected total(order: StaffOrderSummary): string {
    return formatPriceMinor(order.totalMinor, this.currency);
  }

  protected lineCount(count: number): string {
    return fillText(this.text.itemCount, { count });
  }

  protected statusLabel(status: OrderStatus): string {
    return {
      requested: this.text.statusRequested,
      approved: this.text.statusApproved,
      declined: this.text.statusDeclined,
      cancelled: this.text.statusCancelled,
    }[status];
  }

  protected statusTone(status: OrderStatus): StatusTone {
    return orderStatusTone(status);
  }

  constructor() {
    usePageSeo({ name: () => this.text.title });
  }
}
