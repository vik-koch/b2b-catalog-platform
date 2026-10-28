import { Component, computed, inject, input, resource } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import {
  fillText,
  MY_ORDER_FILTERS,
  MyOrderFilter,
} from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { usePageSeo } from '../../shared/core/page-seo';
import { stableValue } from '../../shared/core/stable-value';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Pagination } from '@b2b-catalog-platform/ui/lists/pagination';
import { EmptyState } from '@b2b-catalog-platform/ui/content/empty-state';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { OrderRows } from './order-rows';
import { OrdersService } from './orders.service';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';
import { shoppingBasketIcon } from '@b2b-catalog-platform/ui/icons/glyphs/shopping-basket';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

/**
 * The account's own order requests (FR-ACC-01), newest first — the whole
 * history, paged. The account page shows the newest handful of the same rows.
 */
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

    <!-- What the history is narrowed to, said as the one chip that narrowed
         it (FR-WORK-03). A chip and not a dropdown: nothing on this page
         offers to filter — the marker on the account page does — so what is
         needed here is a way to see the narrowing and undo it, not a control
         for choosing one. -->
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
        <!-- Narrowed to nothing: the queue emptied between the marker being
             drawn and the link being followed, which is what a count over
             current state does. The way out is the whole history, not the
             catalog. -->
        <ui-empty-state
          [icon]="shoppingBasketIcon"
          [message]="text.filterEmpty"
        >
          <a uiButton routerLink="/account/orders">{{ text.action }}</a>
        </ui-empty-state>
      } @else if (data.items.length === 0) {
        <!-- The cart's own empty panel, so an account with nothing on it and a
             cart with nothing in it read as the same kind of screen. The two
             actions are a row inside it rather than two buttons left touching
             each other under a sentence. -->
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
    return fillText(this.text.filterRemoveAria, { label: this.filterLabel() });
  }

  /** Paging keeps whatever the list is narrowed to: a second page of "ready to
   * collect" is still that list. */
  protected readonly pageParams = (page: number): Params => {
    const state = this.filter();
    return state ? { page, state } : { page };
  };

  constructor() {
    usePageSeo({ name: () => this.text.heading });
  }
}
