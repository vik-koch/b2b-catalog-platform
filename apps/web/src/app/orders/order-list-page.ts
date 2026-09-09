import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  MY_ORDER_FILTERS,
  MyOrderFilter,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { stableValue } from '../core/stable-value';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Skeleton } from '../ui/skeleton';
import { Icon } from '../ui/icons/icon';
import { OrderRows } from './order-rows';
import { OrdersService } from './orders.service';

/**
 * The account's own order requests (FR-ACC-01), newest first — the whole
 * history, paged. The account page shows the newest handful of the same rows.
 */
@Component({
  selector: 'app-order-list-page',
  imports: [RouterLink, Button, EmptyState, OrderRows, Skeleton, Icon],
  template: `
    <h1 class="mb-2 text-3xl font-medium tracking-tight">{{ text.heading }}</h1>
    <p class="mb-8 text-muted">{{ text.intro }}</p>

    <!-- What the history is narrowed to, said as the one chip that narrowed
         it (FR-WORK-03). A chip and not a dropdown: nothing on this page
         offers to filter — the marker on the account page does — so what is
         needed here is a way to see the narrowing and undo it, not a control
         for choosing one. -->
    @if (filter(); as state) {
      <div class="mb-6 flex flex-wrap items-center gap-2">
        <span
          class="flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pr-1.5 pl-3 text-sm"
        >
          <span>{{ filterLabel() }}</span>
          <a
            routerLink="/account/orders"
            class="flex items-center justify-center rounded-full p-0.5 text-stone-400 hover:text-red-700"
            [attr.aria-label]="removeLabel()"
          >
            <app-icon name="close" class="h-3.5 w-3.5" />
          </a>
        </span>
      </div>
    }

    @if (shown(); as data) {
      @if (data.items.length === 0 && filter()) {
        <!-- Narrowed to nothing: the queue emptied between the marker being
             drawn and the link being followed, which is what a count over
             current state does. The way out is the whole history, not the
             catalog. -->
        <app-empty-state icon="shopping-basket" [message]="text.filterEmpty">
          <a appButton routerLink="/account/orders">{{ text.action }}</a>
        </app-empty-state>
      } @else if (data.items.length === 0) {
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
        <app-order-rows class="max-w-3xl" [orders]="data.items" />

        @if (data.pagination.totalPages > 1) {
          <nav
            class="mt-8 flex items-center justify-center gap-4 text-sm"
            [attr.aria-label]="catalogText.pageStatus"
          >
            @if (data.pagination.page > 1) {
              <a
                routerLink="/account/orders"
                [queryParams]="pageParams(data.pagination.page - 1)"
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
                [queryParams]="pageParams(data.pagination.page + 1)"
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

  /** Bound from the `state` query param. Absent — which arrives as
   * `undefined`, never as the input's default — is the whole history, and so
   * is a value the URL invented: this page offers no way to choose one, so a
   * bad value is a stale or hand-typed link and the honest answer is
   * everything. */
  readonly state = input<string | undefined>(undefined);
  protected readonly filter = computed((): MyOrderFilter | undefined => {
    const value = this.state();
    return MY_ORDER_FILTERS.find((known) => known === value);
  });

  /** Bound from the `page` query param (a string); coerced and floored to 1. */
  readonly page = input('1');
  private readonly currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

  protected readonly orders = resource({
    params: () => ({ page: this.currentPage(), state: this.filter() }),
    loader: ({ params }) => this.api.listMine(params.page, params.state),
  });

  /** Held across reloads, so paging swaps the rows instead of blanking them. */
  protected readonly shown = stableValue(this.orders);
  protected readonly showSkeleton = delayedLoading(this.orders.isLoading);

  /** The chip's words, and the words on the control that dismisses it. */
  protected readonly filterLabel = computed(() =>
    this.filter() === 'to-pay'
      ? this.text.filterToPay
      : this.text.filterToCollect,
  );
  protected removeLabel(): string {
    return fillText(this.text.filterRemove, { label: this.filterLabel() });
  }

  /** Paging keeps whatever the list is narrowed to: a second page of "ready to
   * collect" is still that list. */
  protected pageParams(page: number): Record<string, string | number> {
    const state = this.filter();
    return state ? { page, state } : { page };
  }

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
