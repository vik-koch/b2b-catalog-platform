import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  OrderStatus,
  OrderSummary,
} from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../catalog/price';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { stableValue } from '../core/stable-value';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { OrdersService } from './orders.service';
import { orderStatusClass } from './order-status';

/**
 * The account's own order requests (FR-ACC-01), newest first.
 *
 * A list of rows rather than a table: the customer side reads on a phone as
 * often as on a desk, and four columns of one order each are what the account
 * page already draws for saved addresses.
 */
@Component({
  selector: 'app-order-list-page',
  imports: [RouterLink, Button, Skeleton],
  template: `
    <h1 class="mb-2 text-3xl font-bold tracking-tight">{{ text.heading }}</h1>
    <p class="mb-8 text-muted">{{ text.intro }}</p>

    @if (shown(); as data) {
      @if (data.items.length === 0) {
        <p class="text-muted">{{ text.empty }}</p>
        <a appButton variant="secondary" routerLink="/catalog" class="mt-5">
          {{ text.emptyAction }}
        </a>
      } @else {
        <ul class="divide-y divide-border">
          @for (order of data.items; track order.reference) {
            <li>
              <!-- The whole row opens the order: the reference is the only
                   thing on it worth clicking, and a link around it is a bigger
                   target than the text. -->
              <a
                class="-mx-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-md px-2 py-4 hover:bg-stone-50"
                [routerLink]="['/account/orders', order.reference]"
              >
                <div>
                  <p class="text-sm font-semibold">{{ order.reference }}</p>
                  <p class="mt-1 text-sm text-muted">
                    {{ formatDate(order.createdAt) }} ·
                    {{ lineCount(order.itemCount) }}
                  </p>
                </div>
                <div class="flex items-center gap-4">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium"
                    [class]="statusClass(order.status)"
                  >
                    {{ statusLabel(order.status) }}
                  </span>
                  <p class="text-sm font-semibold tabular-nums">
                    {{ total(order) }}
                  </p>
                </div>
              </a>
            </li>
          }
        </ul>

        @if (data.pagination.totalPages > 1) {
          <nav
            class="mt-8 flex items-center justify-center gap-4 text-sm"
            [attr.aria-label]="catalogText.pageStatus"
          >
            @if (data.pagination.page > 1) {
              <a
                routerLink="/account/orders"
                [queryParams]="{ page: data.pagination.page - 1 }"
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
                routerLink="/account/orders"
                [queryParams]="{ page: data.pagination.page + 1 }"
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
      }
    } @else if (orders.error()) {
      <p class="text-sm text-red-600" role="alert">{{ text.error }}</p>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="4" />
    }

    <a appButton variant="secondary" routerLink="/account" class="mt-10">
      {{ text.back }}
    </a>
  `,
})
export class OrderListPage {
  private readonly api = inject(OrdersService);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  protected readonly text = inject(APP_TEXT).orders;
  protected readonly catalogText = inject(APP_TEXT).catalog;

  /** Bound from the `page` query param (a string); coerced and floored to 1. */
  readonly page = input('1');
  private readonly currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

  protected readonly orders = resource({
    params: () => this.currentPage(),
    loader: ({ params }) => this.api.listMine(params),
  });

  /** Held across reloads, so paging swaps the rows instead of blanking them. */
  protected readonly shown = stableValue(this.orders);
  protected readonly showSkeleton = delayedLoading(this.orders.isLoading);

  protected total(order: OrderSummary): string {
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
    dateStyle: 'long',
  });

  protected pageStatus(p: { page: number; totalPages: number }): string {
    return fillText(this.catalogText.pageStatus, {
      page: p.page,
      total: p.totalPages,
    });
  }

  constructor() {
    usePageSeo({ name: () => this.text.heading });
  }
}
