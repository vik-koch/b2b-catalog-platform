import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  OrderDetail,
  OrderLine,
  OrderStatus,
} from '@b2b-catalog-platform/shared';
import { OrderSummary } from '../cart/order-summary';
import { formatPriceMinor } from '../catalog/price';
import { formatUnitQuantity } from '../catalog/quantity';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { NotFoundView } from '../pages/not-found-view';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { orderBlocks } from './order-blocks';
import { OrderReadBack, ReadBackLine, ReviewBlock } from './order-read-back';
import { StatusBadge, StatusTone } from '../ui/status-badge';
import { orderStatusTone } from './order-status';
import { OrdersService } from './orders.service';

/**
 * One of the account's own orders (FR-ACC-01), read back exactly as it was
 * sent — every field on it is a snapshot, so this is the order as it stood
 * rather than what the catalogue, the address book or the config say today.
 *
 * Read-only, and there is nothing to add: an order is a request a manager
 * answers, and changing one is a conversation rather than a form.
 */
@Component({
  selector: 'app-order-detail-page',
  imports: [
    RouterLink,
    Button,
    NotFoundView,
    Skeleton,
    OrderReadBack,
    OrderSummary,
    StatusBadge,
  ],
  template: `
    @if (detail(); as detail) {
      <!-- The cart's and the checkout's two columns, at the cart's own notch
           and measured on the page rather than the window: an order is read
           where it was last seen, so the card must not sit beside the lines on
           one screen and under them on the next. -->
      <div class="@container/order">
        <div class="grid gap-8 @min-[72.5rem]/order:grid-cols-[1fr_20rem]">
          <!-- A reading measure inside the track rather than a narrower track:
               an order is read down its left edge and a name-and-price line
               spanning a wide screen is one nobody follows across — but the
               summary must stay where the cart and the checkout put it, and
               narrowing the track would slide it inward on this page alone. -->
          <div class="max-w-3xl">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 class="text-3xl font-bold tracking-tight">
                {{ detail.reference }}
              </h1>
              <span appStatusBadge [tone]="statusTone(detail.status)">
                {{ statusLabel(detail.status) }}
              </span>
            </div>
            <p class="mt-2 text-muted">{{ placed(detail) }}</p>

            <app-order-read-back
              class="mt-8"
              [lines]="lines()"
              [blocks]="blocks()"
            />
          </div>

          <!-- What it came to, and the way back under it: controls belong
               below the card they act after, which is where the cart and the
               checkout put theirs. -->
          <aside
            class="max-w-xl @min-[72.5rem]/order:mt-9 @min-[72.5rem]/order:sticky @min-[72.5rem]/order:top-20 @min-[72.5rem]/order:self-start"
          >
            <app-order-summary
              [lineCount]="detail.lines.length"
              [subtotalMinor]="detail.totalMinor"
              [shipment]="detail.shipment"
            />
            <a
              appButton
              variant="secondary"
              routerLink="/account/orders"
              class="mt-5 w-full"
            >
              {{ text.backToList }}
            </a>
          </aside>
        </div>
      </div>
    } @else if (missing()) {
      <!-- The 404 screen rather than a sentence, the same as the token page
           and the unknown-slug pages: a reference that is not on this account
           is a page that is not there. -->
      <app-not-found-view
        [body]="text.notFound"
        backLink="/account/orders"
        [backLabel]="text.backToList"
      />
    } @else if (order.error()) {
      <p class="text-sm text-red-600" role="alert">{{ text.error }}</p>
      <a
        appButton
        variant="secondary"
        routerLink="/account/orders"
        class="mt-5"
      >
        {{ text.backToList }}
      </a>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }
  `,
})
export class OrderDetailPage {
  private readonly api = inject(OrdersService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = this.config.catalog.currency;

  private readonly orderText = inject(APP_TEXT).orders;
  private readonly checkoutText = inject(APP_TEXT).checkout;
  private readonly units = inject(APP_TEXT).catalog.units;
  protected readonly text = this.orderText.detail;

  /** Bound from the route's `:reference` segment. */
  readonly reference = input.required<string>();

  protected readonly order = resource({
    params: () => this.reference(),
    loader: ({ params }) => this.api.getMine(params),
  });
  protected readonly showSkeleton = delayedLoading(this.order.isLoading);

  /** The order, once there is one. Read through `hasValue` because a resource
   * in an error state throws from `value()`. */
  protected readonly detail = computed(() =>
    this.order.hasValue() ? this.order.value() : null,
  );

  /** Answered, and the answer was "no such order of yours". */
  protected readonly missing = computed(
    () => this.order.hasValue() && this.order.value() === null,
  );

  protected readonly lines = computed<ReadBackLine[]>(() => {
    const detail = this.detail();
    if (!detail) return [];
    return detail.lines.map((line, index) => ({
      key: `${line.slug}-${index}`,
      name: line.name,
      note: line.note,
      href: line.linked ? `/product/${line.slug}` : null,
      quantity: this.quantity(line),
      total: formatPriceMinor(line.lineTotalMinor, this.currency),
    }));
  });

  /**
   * The order's answers, headed by the same words the checkout asked the
   * questions in — so an order reads the same before and after it was sent.
   */
  protected readonly blocks = computed<ReviewBlock[]>(() => {
    const detail = this.detail();
    if (!detail) return [];

    const review = this.checkoutText.review;
    return orderBlocks(
      detail,
      {
        fulfilment: review.fulfilment,
        delivery: this.checkoutText.fulfilment.deliveryTitle,
        pickup: this.checkoutText.fulfilment.pickupTitle,
        invoice: review.invoice,
        billingSame: review.billingSame,
        deliveryDate: this.checkoutText.timing.deliveryLabel,
        pickupDate: this.checkoutText.timing.pickupLabel,
        whenAny: review.whenAny,
        payment: review.payment,
        cash: this.checkoutText.payment.cashTitle,
        transfer: this.checkoutText.payment.transferTitle,
        contact: this.text.contact,
        note: review.note,
      },
      {
        address: this.config.address,
        phoneInput: this.config.phoneInput,
        locale: this.currency.locale,
      },
    );
  });

  /**
   * The quantity in the unit the line was bought through and, where that is
   * not the piece, what it came to in pieces — both frozen with the order, so
   * repacking the product never rewrites what somebody ordered.
   */
  private quantity(line: OrderLine): string {
    const review = this.checkoutText.review;
    const qty = formatUnitQuantity(line.quantity, this.currency);
    const unit = this.units[line.unit];
    if (line.unit === 'piece') {
      return fillText(review.quantity, { qty, unit });
    }
    return fillText(review.quantityPieces, {
      qty,
      unit,
      pieces: formatUnitQuantity(line.pieces, this.currency),
      pieceUnit: this.units.piece,
    });
  }

  protected placed(detail: OrderDetail): string {
    return fillText(this.text.placed, {
      date: this.dateFormat.format(new Date(detail.createdAt)),
    });
  }

  protected statusLabel(status: OrderStatus): string {
    return {
      requested: this.orderText.statusRequested,
      approved: this.orderText.statusApproved,
      declined: this.orderText.statusDeclined,
      cancelled: this.orderText.statusCancelled,
    }[status];
  }

  protected statusTone(status: OrderStatus): StatusTone {
    return orderStatusTone(status);
  }

  private readonly dateFormat = new Intl.DateTimeFormat(this.currency.locale, {
    dateStyle: 'long',
  });

  constructor() {
    usePageSeo({ name: () => this.reference() });
  }
}
