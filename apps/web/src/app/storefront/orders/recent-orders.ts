import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { WorkService } from '../../shared/work/work.service';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { ActionLink } from '@b2b-catalog-platform/ui/actions/action-link';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { shoppingBasketIcon } from '@b2b-catalog-platform/ui/icons/glyphs/shopping-basket';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { Card } from '@b2b-catalog-platform/ui/content/card';
import { SectionTitle } from '@b2b-catalog-platform/ui/content/section-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { OrderRows } from './order-rows';
import { OrdersService } from './orders.service';

/**
 * How many of the newest orders the account page itself shows. Enough that a
 * customer who came to look up what they sent last week finds it here, few
 * enough that the card stays a card — the rest is what the history page is
 * for.
 */
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
    <!-- Order history (FR-ACC-01). The newest few, not a link to them: an
         order history is paged and grows for years, but what somebody comes
         here for is the one they sent last week — and it was a click away
         behind a button that only said the list existed. The page itself is
         still there for the rest of it. -->
    <section>
      <h2 uiSectionTitle class="mb-1.5 flex items-center gap-2">
        <ui-icon [glyph]="shoppingBasketIcon" class="size-4" />
        {{ orderText.heading }}
      </h2>
      <!-- As above: the frame and its bars from the first frame. -->
      <div uiCard>
        <!-- What waits on the account holder, above the rows it is about
             (FR-WORK-03): the same amber line the marker on the account
             control leads here for, and the link opens the history it is
             about. Money due from them, and an order packed for them to
             collect — silent when neither is true. -->
        @if (waitingPayments() || waitingPickups()) {
          <!-- Stacked, as the admin panel's two order notes are: money owed
               and a parcel on the counter are two jobs with two lists. -->
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
            <!-- Only where there is more than what is on screen: a button that
                 opens the same five rows on another page is a click that
                 changes nothing. -->
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

  /** `undefined` where nothing is waiting, so a line is drawn only when there
   * is something to say. Two queues rather than one figure: paying an invoice
   * and collecting a parcel are separate jobs, and each note links to the
   * history narrowed to exactly the orders it counted. */
  protected readonly waitingPayments = computed(
    () => this.work.counts().myPayments || undefined,
  );
  protected readonly waitingPickups = computed(
    () => this.work.counts().myPickups || undefined,
  );

  protected fill(template: string, count: number): string {
    return fillText(template, { count });
  }

  /**
   * The order history's own first page, of which this card shows the newest
   * few. Deliberately the same call the list page makes rather than an
   * endpoint of its own: the count on the answer is also how this card knows
   * whether there is anything more to send anybody to.
   */
  protected readonly orders = resource({
    loader: () => this.api.listMine(1),
  });
  /** Whether the card has an answer of any kind to draw. `isLoading` alone is
   * false before the resource has started, which would count it as ready. */
  protected readonly ordersReady = computed(
    () => !this.orders.isLoading() && this.orders.status() !== 'idle',
  );

  /** Null while loading or failed — `value()` throws on an errored resource. */
  protected readonly recentOrders = computed(() =>
    this.orders.hasValue()
      ? this.orders.value().items.slice(0, RECENT_ORDERS)
      : null,
  );

  /** Whether the history holds more than this card is showing. */
  protected readonly hasMoreOrders = computed(
    () =>
      this.orders.hasValue() &&
      this.orders.value().pagination.total > RECENT_ORDERS,
  );
}
