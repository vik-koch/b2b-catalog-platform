import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  OrderAddress,
  OrderDetail,
  OrderLine,
  OrderStatus,
} from '@b2b-catalog-platform/shared';
import { addressLines } from '../addresses/address-format';
import { OrderSummary } from '../cart/order-summary';
import { formatPriceMinor } from '../catalog/price';
import { formatUnitQuantity } from '../catalog/quantity';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { formatPhone } from '../core/contact-fields';
import { delayedLoading } from '../core/delayed-loading';
import { fillText } from '../core/fill-text';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { OrderReadBack, ReadBackLine, ReviewBlock } from './order-read-back';
import { orderStatusClass } from './order-status';
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
  imports: [RouterLink, Button, Skeleton, OrderReadBack, OrderSummary],
  template: `
    @if (detail(); as detail) {
      <div class="max-w-4xl">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 class="text-3xl font-bold tracking-tight">
            {{ detail.reference }}
          </h1>
          <span
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            [class]="statusClass(detail.status)"
          >
            {{ statusLabel(detail.status) }}
          </span>
        </div>
        <p class="mt-2 text-muted">{{ placed(detail) }}</p>

        <!-- The lines and the answers on the left, what it came to on the
             right — the same two columns the checkout read-back had, so the
             order is laid out where the customer last saw it. -->
        <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
          <app-order-read-back [lines]="lines()" [blocks]="blocks()" />
          <app-order-summary
            [lineCount]="detail.lines.length"
            [subtotalMinor]="detail.totalMinor"
            [shipment]="detail.shipment"
          />
        </div>
      </div>
    } @else if (missing()) {
      <p class="text-muted">{{ text.notFound }}</p>
    } @else if (order.error()) {
      <p class="text-sm text-red-600" role="alert">{{ text.error }}</p>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }

    <a appButton variant="secondary" routerLink="/account/orders" class="mt-10">
      {{ text.backToList }}
    </a>
  `,
})
export class OrderDetailPage {
  private readonly api = inject(OrdersService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = this.config.catalog.currency;

  private readonly orderText = inject(APP_TEXT).auth.myAccount.orders;
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
   * The order's answers, in the order checkout asked them and under the same
   * headings — a customer reading an order back is walking down the form they
   * filled in.
   */
  protected readonly blocks = computed<ReviewBlock[]>(() => {
    const detail = this.detail();
    if (!detail) return [];

    const review = this.checkoutText.review;
    const fulfilment = this.checkoutText.fulfilment;
    const pickup = detail.pickup;

    const arrival = pickup
      ? [fulfilment.pickupTitle, pickup.name, pickup.address]
      : [
          fulfilment.deliveryTitle,
          ...this.addressLines(detail.deliveryAddress),
        ];

    const party = detail.party.registrationId
      ? `${detail.party.name} · ${detail.party.registrationId}`
      : detail.party.name;
    const invoice = [
      party,
      ...(this.sameAddress(detail)
        ? [review.billingSame]
        : this.addressLines(detail.billingAddress)),
    ];

    const blocks: ReviewBlock[] = [
      { heading: review.fulfilment, lines: arrival },
      { heading: review.invoice, lines: invoice },
      {
        heading: pickup
          ? this.checkoutText.timing.pickupLabel
          : this.checkoutText.timing.deliveryLabel,
        lines: [
          detail.preferredDate
            ? this.formatDate(detail.preferredDate)
            : review.whenAny,
        ],
      },
      {
        heading: review.payment,
        lines: [
          detail.paymentMethod === 'bank-transfer'
            ? this.checkoutText.payment.transferTitle
            : this.checkoutText.payment.cashTitle,
        ],
      },
      {
        // Not on the checkout's own read-back, where the contact is whoever is
        // filling the form. Weeks later it is the thing that says who takes the
        // call — and it may well be a colleague.
        heading: this.text.contact,
        lines: [
          detail.contact.name,
          detail.contact.email,
          formatPhone(detail.contact.phone, this.config.phoneInput),
        ],
      },
    ];
    if (detail.customerNote) {
      blocks.push({ heading: review.note, lines: [detail.customerNote] });
    }
    return blocks.map((block) => ({
      ...block,
      lines: block.lines.filter((line) => line.trim().length > 0),
    }));
  });

  /** Billing repeated the delivery address, which is the ordinary case. */
  private sameAddress(detail: OrderDetail): boolean {
    const delivery = detail.deliveryAddress;
    if (!delivery) return false;
    return (
      this.addressLines(delivery).join('\n') ===
      this.addressLines(detail.billingAddress).join('\n')
    );
  }

  private addressLines(address: OrderAddress | null): string[] {
    if (!address) return [];
    // A snapshot has no label, no id and no timestamps; the writer only wants
    // the place.
    return addressLines(
      { ...address, label: null, id: '', createdAt: '', updatedAt: '' },
      this.config.address,
    );
  }

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

  protected statusClass(status: OrderStatus): string {
    return orderStatusClass(status);
  }

  /** An ISO date, read as a day rather than as an instant: a preferred date
   * carries no time, and parsing it as one moves it a timezone either way. */
  private formatDate(iso: string): string {
    return this.dateFormat.format(new Date(`${iso}T00:00:00`));
  }

  private readonly dateFormat = new Intl.DateTimeFormat(this.currency.locale, {
    dateStyle: 'long',
  });

  constructor() {
    usePageSeo({ name: () => this.reference() });
  }
}
