import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { orderStatusSchema, OrderStatus } from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../../catalog/price';
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { delayedLoading } from '../../core/delayed-loading';
import { fillText } from '../../core/fill-text';
import { usePageSeo } from '../../core/page-seo';
import { stableValue } from '../../core/stable-value';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { orderStatusClass } from '../../orders/order-status';
import { AdminListHeader } from '../list-header';
import {
  GridFilterOption,
  GridFilterSelect,
} from '../products/grid-filter-select';
import { AdminOrdersService, StaffOrderSummary } from './orders.service';

/**
 * Every order request, for staff (FR-AUTH-03). Read-only: an order is answered
 * by phone or mail, and the status transitions that will move it are not here
 * yet.
 *
 * Newest first, with the status as the one filter — the question a manager
 * opens this list with is "what have I not answered yet?". The filter is a
 * query parameter like every other grid's, so a narrowed list is shareable and
 * survives a reload. There is no find-a-row box: the list is paged server-side
 * and the endpoint takes no query, and a box that filtered one page would be a
 * lie. A mailed order is opened by its own link rather than looked up here.
 */
@Component({
  selector: 'app-admin-order-list-page',
  imports: [RouterLink, Button, AdminListHeader, GridFilterSelect, Skeleton],
  template: `
    <app-admin-list-header
      [title]="text.title"
      [searchable]="false"
      [filtered]="!!status()"
    />

    @if (orders.error()) {
      <p class="text-muted" role="alert">{{ text.loadError }}</p>
    } @else if (shown(); as data) {
      <!-- The table renders even when empty: its header carries the filter that
           produced the empty result. -->
      <div class="overflow-x-auto">
        <table
          class="w-full table-fixed text-left text-sm [&_th,&_td]:py-2 [&_th,&_td]:pr-4 [&_th:last-child,&_td:last-child]:pr-0"
          [attr.aria-busy]="orders.isLoading() ? 'true' : null"
        >
          <thead>
            <tr class="border-b border-border text-subtle">
              <th class="w-[22%] font-medium">{{ text.reference }}</th>
              <th class="w-[16%] font-medium">{{ text.placed }}</th>
              <th class="w-[26%] font-medium">{{ text.customer }}</th>
              <th class="w-[14%]">
                <app-grid-filter-select
                  param="status"
                  [options]="statusOptions"
                  [value]="status()"
                  [ariaLabel]="text.filterStatus"
                />
              </th>
              <th class="w-[10%] font-medium">{{ text.items }}</th>
              <th class="w-[12%] text-right font-medium">{{ text.total }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            @for (order of data.items; track order.reference) {
              <tr>
                <td class="truncate font-medium">
                  <a
                    class="hover:text-accent"
                    [routerLink]="['/admin/orders', order.reference]"
                  >
                    {{ order.reference }}
                  </a>
                </td>
                <td class="truncate text-subtle">
                  {{ formatDate(order.createdAt) }}
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
                <td>
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium"
                    [class]="statusClass(order.status)"
                  >
                    {{ statusLabel(order.status) }}
                  </span>
                </td>
                <td class="truncate text-subtle">
                  {{ lineCount(order.itemCount) }}
                </td>
                <td class="text-right tabular-nums">{{ total(order) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (data.items.length === 0) {
        <p class="mt-6 text-muted">
          {{ status() ? text.noResults : text.empty }}
        </p>
      }

      @if (data.pagination.totalPages > 1) {
        <nav
          class="mt-8 flex items-center justify-center gap-4 text-sm"
          [attr.aria-label]="common.pageStatus"
        >
          @if (data.pagination.page > 1) {
            <a
              routerLink="/admin/orders"
              [queryParams]="{ page: data.pagination.page - 1 }"
              queryParamsHandling="merge"
              appButton
              variant="ghost"
              size="sm"
              >{{ common.prevPage }}</a
            >
          } @else {
            <span class="px-3 py-1.5 text-stone-300">{{
              common.prevPage
            }}</span>
          }
          <span class="text-subtle">{{ pageStatus(data.pagination) }}</span>
          @if (data.pagination.page < data.pagination.totalPages) {
            <a
              routerLink="/admin/orders"
              [queryParams]="{ page: data.pagination.page + 1 }"
              queryParamsHandling="merge"
              appButton
              variant="ghost"
              size="sm"
              >{{ common.nextPage }}</a
            >
          } @else {
            <span class="px-3 py-1.5 text-stone-300">{{
              common.nextPage
            }}</span>
          }
        </nav>
      }
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }
  `,
})
export class AdminOrderListPage {
  private readonly api = inject(AdminOrdersService);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  protected readonly text = inject(ADMIN_TEXT).orderList;
  // Paging wording is the storefront's, as on the product grid: the words for
  // "next page" do not differ by audience.
  protected readonly common = inject(APP_TEXT).catalog;

  /** Bound from the query parameters; both are narrowed before they reach the
   * API, so a hand-edited URL falls back to the default view. */
  readonly page = input('1');
  readonly status = input('');

  private readonly currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  private readonly statusKey = computed<OrderStatus | undefined>(() => {
    const parsed = orderStatusSchema.safeParse(this.status());
    return parsed.success ? parsed.data : undefined;
  });

  protected readonly orders = resource({
    params: () => ({ page: this.currentPage(), status: this.statusKey() }),
    loader: ({ params }) => this.api.list(params),
  });

  /** Held across reloads, so filtering or paging swaps the rows instead of
   * blanking the table the filter sits in. */
  protected readonly shown = stableValue(this.orders);
  protected readonly showSkeleton = delayedLoading(this.orders.isLoading);

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

  protected statusClass(status: OrderStatus): string {
    return orderStatusClass(status);
  }

  protected formatDate(iso: string): string {
    return this.dateFormat.format(new Date(iso));
  }

  private readonly dateFormat = new Intl.DateTimeFormat(this.currency.locale, {
    dateStyle: 'medium',
  });

  protected pageStatus(p: { page: number; totalPages: number }): string {
    return fillText(this.common.pageStatus, {
      page: p.page,
      total: p.totalPages,
    });
  }

  constructor() {
    usePageSeo({ name: () => this.text.title });
  }
}
