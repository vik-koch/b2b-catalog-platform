import { Component, computed, inject, input, resource } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import {
  MY_ORDER_FILTERS,
  MyOrderFilter,
} from '@b2b-catalog-platform/shared/core/ordering';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { delayedLoading } from '../../../platform/delayed-loading';
import { usePageSeo } from '../../../platform/page-seo';
import { stableValue } from '../../../platform/stable-value';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Pagination } from '@b2b-catalog-platform/ui/lists/pagination';
import { EmptyState } from '@b2b-catalog-platform/ui/content/empty-state';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { OrderRows } from './ui/order-rows';
import { OrdersService } from './orders.service';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';
import { shoppingBasketIcon } from '@b2b-catalog-platform/ui/icons/glyphs/shopping-basket';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

/** The account's whole order history, newest first, paged (FR-ACC-01). */
@Component({
  selector: 'app-order-list-page',
  imports: [
    RouterLink,
    Button,
    EmptyState,
    OrderRows,
    Skeleton,
    Icon,
    PageTitle,
    ErrorText,
    PageIntro,
    Pagination,
  ],
  template: `
    <h1 uiPageTitle class="mb-2">{{ text.heading }}</h1>
    <p uiPageIntro class="mb-4">{{ text.intro }}</p>

    <!-- A chip, not a filter control: the narrowing comes from the account
         page's marker (FR-WORK-03), and here it only needs undoing. -->
    @if (filter(); as state) {
      <div class="mb-6 flex flex-wrap items-center gap-2">
        <span
          class="flex items-center gap-1.5 rounded-full bg-surface py-1 pr-1.5
                 pl-3 text-sm"
        >
          <span>{{ filterLabel() }}</span>
          <a
            routerLink="/account/orders"
            class="flex items-center justify-center rounded-full p-0.5
                   text-ink-subtle
                   hover:text-danger"
            [attr.aria-label]="removeLabel()"
          >
            <ui-icon [glyph]="xIcon" class="size-3.5" />
          </a>
        </span>
      </div>
    }

    @if (shown(); as data) {
      @if (data.items.length === 0 && filter()) {
        <!-- The queue emptied since the marker was drawn: out to the whole
             history. -->
        <ui-empty-state
          [icon]="shoppingBasketIcon"
          [message]="text.filterEmpty"
        >
          <a uiButton routerLink="/account/orders">{{ text.action }}</a>
        </ui-empty-state>
      } @else if (data.items.length === 0) {
        <ui-empty-state [icon]="shoppingBasketIcon" [message]="text.empty">
          <a uiButton routerLink="/catalog">{{ text.emptyAction }}</a>
          <a uiButton variant="secondary" routerLink="/account">
            {{ text.back }}
          </a>
        </ui-empty-state>
      } @else {
        <app-order-rows class="max-w-3xl" [orders]="data.items" />

        <ui-pagination
          class="mt-8"
          link="/account/orders"
          [page]="data.pagination.page"
          [totalPages]="data.pagination.totalPages"
          [queryParams]="pageParams"
        />

        <a uiButton variant="secondary" routerLink="/account" class="mt-10">
          {{ text.back }}
        </a>
      }
    } @else if (orders.error()) {
      <p uiErrorText role="alert">{{ text.error }}</p>
      <a uiButton variant="secondary" routerLink="/account" class="mt-5">
        {{ text.back }}
      </a>
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="4" />
    }
  `,
})
export class OrderListPage {
  protected readonly shoppingBasketIcon = shoppingBasketIcon;
  protected readonly xIcon = xIcon;
  private readonly api = inject(OrdersService);
  protected readonly text = inject(STOREFRONT_TEXT).orders;

  /** Bound from the `state` query param; absent arrives as `undefined`. An
   * unknown value is a stale link and shows the whole history. */
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

  protected readonly filterLabel = computed(() =>
    this.filter() === 'to-pay'
      ? this.text.filterToPay
      : this.text.filterToCollect,
  );
  protected removeLabel(): string {
    return fillText(this.text.filterRemoveAria, { label: this.filterLabel() });
  }

  /** Paging keeps the narrowing. */
  protected readonly pageParams = (page: number): Params => {
    const state = this.filter();
    return state ? { page, state } : { page };
  };

  constructor() {
    usePageSeo({ name: () => this.text.heading });
  }
}
