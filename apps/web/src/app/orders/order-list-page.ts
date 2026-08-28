import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { stableValue } from '../core/stable-value';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { OrderRows } from './order-rows';
import { OrdersService } from './orders.service';

/**
 * The account's own order requests (FR-ACC-01), newest first — the whole
 * history, paged. The account page shows the newest handful of the same rows.
 */
@Component({
  selector: 'app-order-list-page',
  imports: [RouterLink, Button, EmptyState, OrderRows, Skeleton],
  template: `
    <h1 class="mb-2 text-3xl font-bold tracking-tight">{{ text.heading }}</h1>
    <p class="mb-8 text-muted">{{ text.intro }}</p>

    @if (shown(); as data) {
      @if (data.items.length === 0) {
        <!-- The cart's own empty panel, so an account with nothing on it and a
             cart with nothing in it read as the same kind of screen. The two
             actions are a row inside it rather than two buttons left touching
             each other under a sentence. -->
        <app-empty-state icon="shopping-basket" [message]="text.empty">
          <a appButton routerLink="/catalog">{{ text.emptyAction }}</a>
          <a appButton variant="secondary" routerLink="/account">
            {{ text.back }}
          </a>
        </app-empty-state>
      } @else {
        <app-order-rows [orders]="data.items" />

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

        <a appButton variant="secondary" routerLink="/account" class="mt-10">
          {{ text.back }}
        </a>
      }
    } @else if (orders.error()) {
      <p class="text-sm text-red-600" role="alert">{{ text.error }}</p>
      <a appButton variant="secondary" routerLink="/account" class="mt-5">
        {{ text.back }}
      </a>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="4" />
    }
  `,
})
export class OrderListPage {
  private readonly api = inject(OrdersService);
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
