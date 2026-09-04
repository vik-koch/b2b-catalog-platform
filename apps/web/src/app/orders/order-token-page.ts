import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  OrderDetail,
  OrderStatus,
} from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
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
 * An order opened by the link its confirmation mail carries (FR-NOTIF-06).
 *
 * The token is the credential and the only one: whoever holds the link reads
 * the order, which is what makes it useful to a guest — they have no account to
 * read it from. Nothing here is editable and nothing identifies the account,
 * for the same reason.
 *
 * Kept out of the index (NFR-SEO-04): a crawler has no way to hold one of these
 * links, but a referrer leak should not turn one into a search result.
 */
@Component({
  selector: 'app-order-token-page',
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
    @if (detail(); as order) {
      <!-- Left-aligned under a left-aligned heading, in the same two columns
           the cart, the checkout and the account's own order page draw: this
           is the same order read through a link rather than through a session,
           and it should not be a differently shaped page for it. -->
      <div class="@container/order">
        <div
          class="grid gap-8 @min-[63.75rem]/order:grid-cols-[36rem_20rem] @min-[63.75rem]/order:justify-between"
        >
          <!-- The track is the measure: an order is read down its left edge,
               and a name-and-price line spanning a wide screen is one nobody
               follows across. The same 36rem the cart gives its lines and the
               checkout its form, so the card beside it lands in one place on
               all three. -->
          <div class="max-w-xl">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 class="text-3xl font-medium tracking-tight">
                {{ order.reference }}
              </h1>
              <span appStatusBadge [tone]="statusTone(order.status)">
                {{ statusLabel(order.status) }}
              </span>
            </div>
            <p class="mt-2 text-muted">{{ placed(order) }}</p>
            <p class="mt-4 max-w-xl text-muted">{{ text.intro }}</p>

            <app-order-read-back
              class="mt-8"
              [lines]="lines()"
              [blocks]="blocks()"
            />
          </div>

          <aside
            class="max-w-xl @min-[63.75rem]/order:mt-9 @min-[63.75rem]/order:sticky @min-[63.75rem]/order:top-20 @min-[63.75rem]/order:self-start"
          >
            <app-order-summary
              [lineCount]="order.lines.length"
              [subtotalMinor]="order.totalMinor"
              [shipment]="order.shipment"
            />

            <!-- The account offer the checkout deliberately postponed:
                 approval takes days, and an order already sent costs nothing
                 to wait for. Never to somebody who already has one — this page
                 is reachable by anyone holding the link, including a customer
                 who followed an old one or was forwarded it.

                 Under the summary, where every other flow keeps what to do
                 next. -->
            @if (!signedIn()) {
              <div class="mt-5 rounded-lg border border-border p-5">
                <p class="text-sm text-muted">{{ text.register }}</p>
                <a
                  appButton
                  variant="secondary"
                  routerLink="/register"
                  class="mt-4 w-full"
                >
                  {{ text.registerAction }}
                </a>
              </div>
            }
          </aside>
        </div>
      </div>
    } @else if (missing()) {
      <!-- The same 404 screen an unknown product or category gets: a link that
           opens nothing is a link that opens nothing, and this one was a
           couple of lines of prose where the rest of the app draws a page. It
           carries the response status too, so a leaked link answers a crawler
           honestly. -->
      <app-not-found-view
        [body]="text.notFound"
        backLink="/"
        [backLabel]="text.home"
      />
    } @else if (order.error()) {
      <p class="text-sm text-red-600" role="alert">{{ orderText.error }}</p>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }
  `,
})
export class OrderTokenPage {
  private readonly api = inject(OrdersService);
  private readonly auth = inject(AuthService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = this.config.catalog.currency;

  protected readonly orderText = inject(APP_TEXT).orders;
  private readonly checkoutText = inject(APP_TEXT).checkout;
  private readonly units = inject(APP_TEXT).catalog.units;
  protected readonly text = this.orderText.public;

  /**
   * Whether the reader has an account of their own. The cookie hint rather
   * than the resolved session, so the offer is absent on the first frame
   * instead of appearing and being taken away again.
   *
   * Deliberately not a redirect to the account's own order page: the token is
   * the credential here, and whoever holds the link may well not be the
   * customer whose order it is.
   */
  protected readonly signedIn = computed(
    () => this.auth.hintedRole() !== null || this.auth.user() !== null,
  );

  /** Bound from the route's `:token` segment. */
  readonly token = input.required<string>();

  protected readonly order = resource({
    params: () => this.token(),
    loader: ({ params }) => this.api.getByToken(params),
  });
  protected readonly showSkeleton = delayedLoading(this.order.isLoading);

  /** Read through `hasValue`: an errored resource throws from `value()`. */
  protected readonly detail = computed(() =>
    this.order.hasValue() ? this.order.value() : null,
  );
  protected readonly missing = computed(
    () => this.order.hasValue() && this.order.value() === null,
  );

  protected readonly lines = computed<ReadBackLine[]>(() => {
    const order = this.detail();
    if (!order) return [];
    return order.lines.map((line, index) => ({
      key: `${line.slug}-${index}`,
      name: line.name,
      note: line.note,
      href: line.linked ? `/product/${line.slug}` : null,
      quantity: this.quantity(line),
      total: formatPriceMinor(line.lineTotalMinor, this.currency),
    }));
  });

  protected readonly blocks = computed<ReviewBlock[]>(() => {
    const order = this.detail();
    if (!order) return [];

    const review = this.checkoutText.review;
    return orderBlocks(
      order,
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
        contact: this.orderText.detail.contact,
        note: review.note,
      },
      {
        address: this.config.address,
        phoneInput: this.config.phoneInput,
        locale: this.currency.locale,
      },
    );
  });

  private quantity(line: OrderDetail['lines'][number]): string {
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

  protected placed(order: OrderDetail): string {
    return fillText(this.orderText.detail.placed, {
      date: new Intl.DateTimeFormat(this.currency.locale, {
        dateStyle: 'long',
      }).format(new Date(order.createdAt)),
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
    return orderStatusTone(status, 'customer');
  }

  constructor() {
    usePageSeo({
      name: () => this.text.heading,
      noindex: true,
      noreferrer: true,
    });
  }
}
