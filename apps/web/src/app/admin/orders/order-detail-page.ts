import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AdminOrderDetail,
  AdminOrderLine,
  fillText,
  OrderStatus,
} from '@b2b-catalog-platform/shared';
import { OrderSummary } from '../../cart/order-summary';
import { formatPriceMinor } from '../../catalog/price';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { orderBlocks } from '../../orders/order-blocks';
import {
  OrderReadBack,
  ReadBackLine,
  ReviewBlock,
} from '../../orders/order-read-back';
import { orderStatusClass } from '../../orders/order-status';
import { AdminOrdersService } from './orders.service';

/**
 * One order as staff read it (FR-AUTH-03) — the customer's own page plus what
 * they must never see: which price list it was taken from, whose account it
 * came from, and the lines in **basis units** (FR-UNIT-04), which is what the
 * source system prices in.
 *
 * Read-only. Answering an order is a phone call today; the transitions arrive
 * with order processing.
 */
@Component({
  selector: 'app-admin-order-detail-page',
  imports: [RouterLink, Button, Skeleton, OrderReadBack, OrderSummary],
  template: `
    @if (detail(); as order) {
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 class="text-3xl font-bold tracking-tight">{{ order.reference }}</h1>
        <span
          class="rounded-full px-2 py-0.5 text-xs font-medium"
          [class]="statusClass(order.status)"
        >
          {{ statusLabel(order.status) }}
        </span>
      </div>
      <p class="mt-2 text-muted">{{ placed(order) }}</p>

      <!-- What only staff see, above the order itself: whose it is and what it
           was priced from are why a manager opened this page. -->
      <dl
        class="mt-6 grid gap-x-8 gap-y-2 rounded-lg border border-border p-5 text-sm sm:grid-cols-[10rem_1fr]"
      >
        <dt class="text-subtle">{{ text.customer }}</dt>
        <dd>{{ order.customerEmail ?? listText.guest }}</dd>
        <dt class="text-subtle">{{ text.tier }}</dt>
        <dd>{{ order.tierKey ?? text.tierDefault }}</dd>
        <dt class="text-subtle">{{ text.statusChanged }}</dt>
        <dd>{{ statusChanged(order) }}</dd>
      </dl>

      <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <app-order-read-back
          [itemsHeading]="text.items"
          [lines]="lines()"
          [blocks]="blocks()"
        />
        <app-order-summary
          [lineCount]="order.lines.length"
          [subtotalMinor]="order.totalMinor"
          [shipment]="order.shipment"
        />
      </div>
    } @else if (missing()) {
      <p class="text-muted">{{ text.notFound }}</p>
    } @else if (order.error()) {
      <p class="text-muted" role="alert">{{ text.loadError }}</p>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }

    <a appButton variant="secondary" routerLink="/admin/orders" class="mt-10">
      {{ text.back }}
    </a>
  `,
})
export class AdminOrderDetailPage {
  private readonly api = inject(AdminOrdersService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = this.config.catalog.currency;

  protected readonly text = inject(ADMIN_TEXT).orderDetail;
  protected readonly listText = inject(ADMIN_TEXT).orderList;

  readonly reference = input.required<string>();

  protected readonly order = resource({
    params: () => this.reference(),
    loader: ({ params }) => this.api.get(params),
  });
  protected readonly showSkeleton = delayedLoading(this.order.isLoading);

  /** Read through `hasValue`: a resource in an error state throws from
   * `value()`. */
  protected readonly detail = computed(() =>
    this.order.hasValue() ? this.order.value() : null,
  );
  protected readonly missing = computed(
    () => this.order.hasValue() && this.order.value() === null,
  );

  /**
   * The lines in basis units — "10 × 19.99" for a box of a hundred pieces
   * priced per ten. Not the customer's reading of the same line: staff work
   * against the source system, which prices in these units, and an order that
   * has to be checked against it reads in its numbers.
   */
  protected readonly lines = computed<ReadBackLine[]>(() => {
    const order = this.detail();
    if (!order) return [];
    return order.lines.map((line, index) => ({
      key: `${line.slug}-${index}`,
      name: line.name,
      note: line.note,
      href: line.linked ? `/product/${line.slug}` : null,
      quantity: this.basis(line),
      total: formatPriceMinor(line.lineTotalMinor, this.currency),
    }));
  });

  protected readonly blocks = computed<ReviewBlock[]>(() => {
    const order = this.detail();
    if (!order) return [];
    return orderBlocks(order, this.text, {
      address: this.config.address,
      phoneInput: this.config.phoneInput,
      locale: this.currency.locale,
    });
  });

  private basis(line: AdminOrderLine): string {
    return fillText(this.text.basis, {
      count: line.pieces / line.priceBasisPieces,
      price: formatPriceMinor(line.priceMinor, this.currency),
    });
  }

  protected placed(order: AdminOrderDetail): string {
    return fillText(this.text.placed, {
      date: this.dateFormat.format(new Date(order.createdAt)),
    });
  }

  protected statusChanged(order: AdminOrderDetail): string {
    return this.dateFormat.format(new Date(order.statusChangedAt));
  }

  protected statusLabel(status: OrderStatus): string {
    return {
      requested: this.listText.statusRequested,
      approved: this.listText.statusApproved,
      declined: this.listText.statusDeclined,
      cancelled: this.listText.statusCancelled,
    }[status];
  }

  protected statusClass(status: OrderStatus): string {
    return orderStatusClass(status);
  }

  private readonly dateFormat = new Intl.DateTimeFormat(this.currency.locale, {
    dateStyle: 'long',
  });

  constructor() {
    usePageSeo({ name: () => this.reference() });
  }
}
