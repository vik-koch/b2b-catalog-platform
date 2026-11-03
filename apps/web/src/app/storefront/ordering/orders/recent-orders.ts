import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { WorkService } from '../../../shared/work/work.service';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { ActionLink } from '@b2b-catalog-platform/ui/actions/action-link';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { shoppingBasketIcon } from '@b2b-catalog-platform/ui/icons/glyphs/shopping-basket';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { Card } from '@b2b-catalog-platform/ui/content/card';
import { SectionTitle } from '@b2b-catalog-platform/ui/content/section-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { OrderRows } from './ui/order-rows';
import { OrdersService } from './orders.service';

/** Enough to find last week's order; the history page has the rest. */
const RECENT_ORDERS = 5;

/** The account page's order section: the newest few, and what waits on them. */
@Component({
  selector: 'app-recent-orders',
  imports: [
    SectionTitle,
    Card,
    Skeleton,
    Button,
    OrderRows,
    RouterLink,
    Icon,
    ActionLink,
    ErrorText,
  ],
  template: `
    <section>
      <h2 uiSectionTitle class="mb-1.5 flex items-center gap-2">
        <ui-icon [glyph]="shoppingBasketIcon" class="size-4" />
        {{ orderText.heading }}
      </h2>
      <div uiCard>
        <!-- What waits on the account holder (FR-WORK-03), each linking to
             the history narrowed to it. -->
        @if (waitingPayments() || waitingPickups()) {
          <div class="mb-4 flex flex-col gap-1">
            @if (waitingPayments(); as count) {
              <a
                uiActionLink
                routerLink="/account/orders"
                [queryParams]="{ state: 'to-pay' }"
                >{{ fill(orderText.awaitingPayment, count) }}</a
              >
            }
            @if (waitingPickups(); as count) {
              <a
                uiActionLink
                routerLink="/account/orders"
                [queryParams]="{ state: 'to-collect' }"
                >{{ fill(orderText.awaitingPickup, count) }}</a
              >
            }
          </div>
        }
        @if (!ordersReady()) {
          <ui-skeleton [lines]="3" />
        } @else if (recentOrders(); as recent) {
          @if (recent.length === 0) {
            <p class="text-sm text-ink-subtle">{{ orderText.empty }}</p>
            <a uiButton variant="secondary" routerLink="/catalog" class="mt-5">
              {{ orderText.emptyAction }}
            </a>
          } @else {
            <app-order-rows [orders]="recent" />
            @if (hasMoreOrders()) {
              <a
                uiButton
                variant="secondary"
                routerLink="/account/orders"
                class="mt-5"
              >
                {{ orderText.action }}
              </a>
            }
          }
        } @else {
          <p uiErrorText role="alert">
            {{ orderText.error }}
          </p>
        }
      </div>
    </section>
  `,
})
export class RecentOrders {
  protected readonly shoppingBasketIcon = shoppingBasketIcon;

  private readonly api = inject(OrdersService);
  private readonly work = inject(WorkService);
  protected readonly orderText = inject(STOREFRONT_TEXT).orders;

  /** `undefined` at zero, so no line is drawn. */
  protected readonly waitingPayments = computed(
    () => this.work.counts().myPayments || undefined,
  );
  protected readonly waitingPickups = computed(
    () => this.work.counts().myPickups || undefined,
  );

  protected fill(template: string, count: number): string {
    return fillText(template, { count });
  }

  /** The history's first page: its total also says whether there is more. */
  protected readonly orders = resource({
    loader: () => this.api.listMine(1),
  });
  /** `isLoading` alone is false before the resource starts. */
  protected readonly ordersReady = computed(
    () => !this.orders.isLoading() && this.orders.status() !== 'idle',
  );

  /** Null while loading or failed: `value()` throws on an errored resource. */
  protected readonly recentOrders = computed(() =>
    this.orders.hasValue()
      ? this.orders.value().items.slice(0, RECENT_ORDERS)
      : null,
  );

  protected readonly hasMoreOrders = computed(
    () =>
      this.orders.hasValue() &&
      this.orders.value().pagination.total > RECENT_ORDERS,
  );
}
