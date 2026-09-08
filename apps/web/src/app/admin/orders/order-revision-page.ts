import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { OrderSummary } from '../../cart/order-summary';
import { formatPriceMinor } from '../../catalog/price';
import { ADMIN_TEXT } from '../../config/admin-text';
import { APP_TEXT } from '../../config/app-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { orderBlocks } from '../../orders/order-blocks';
import {
  OrderReadBack,
  ReadBackLine,
  ReviewBlock,
} from '../../orders/order-read-back';
import { orderStatusLabel, orderStatusTone } from '../../orders/order-status';
import {
  customerBlockLabels,
  customerQuantity,
  orderDateTimeFormat,
} from '../../orders/order-view';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { StatusBadge, StatusTone } from '../../ui/status-badge';
import { AdminOrdersService } from './orders.service';
import { revisionKindLabel } from './revision-labels';

/**
 * One version of an order, read back (FR-ORD-03, ADR 0051).
 *
 * **The customer's own page, on a staff screen.** The same lines in the same
 * units, the same blocks under the same headings — because the question this
 * page answers is what the customer is looking at, and a staff rendering of
 * their own would be a second opinion about it. What it adds is the handful of
 * facts only the shop has: which version this is, which one they are being
 * shown, and whether the money arrived.
 *
 * And it does nothing. Every control an order has lives on the page that
 * answers it, one route up: reading a version and changing one are different
 * jobs, and a version already superseded is not a thing to press buttons at.
 */
@Component({
  selector: 'app-admin-order-revision-page',
  imports: [
    RouterLink,
    Button,
    Skeleton,
    OrderReadBack,
    OrderSummary,
    StatusBadge,
  ],
  template: `
    @if (revision(); as order) {
      <div class="@container/order">
        <div
          class="grid gap-10 @min-[63.75rem]/order:grid-cols-[1fr_20rem] @min-[63.75rem]/order:justify-between"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 class="text-3xl font-medium tracking-tight">
                {{ order.reference }}
              </h1>
              <span appStatusBadge [tone]="statusTone()">
                {{ statusLabel() }}
              </span>
            </div>
            <p class="mt-2 text-muted">{{ placed() }}</p>

            <!-- The same block staff read on the order itself, and
                 deliberately the same: what only staff see, in the shape they
                 see it in everywhere else. Without a single control — this
                 page reads a version, and a version already superseded is not
                 a thing to press buttons at. -->
            <section class="mt-6 rounded-lg border border-border p-5 text-sm">
              <dl
                class="grid gap-x-6 gap-y-3 break-words sm:grid-cols-[7rem_1fr]"
              >
                <dt class="text-subtle">{{ detailText.customer }}</dt>
                <dd>{{ order.customerEmail ?? listText.guest }}</dd>
                <dt class="text-subtle">{{ detailText.tier }}</dt>
                <dd>{{ order.tierKey ?? detailText.tierDefault }}</dd>

                <dt class="text-subtle">
                  {{ detailText.paymentState.heading }}
                </dt>
                <dd>{{ paymentLabel() }}</dd>

                <dt class="text-subtle">{{ listText.status }}</dt>
                <dd class="min-w-0">
                  <span appStatusBadge [tone]="statusTone()">
                    {{ statusLabel() }}
                  </span>
                  @if (order.statusReason; as reason) {
                    <p class="mt-1">
                      <span class="text-subtle">
                        {{ detailText.statusReason }}:
                      </span>
                      {{ reason }}
                    </p>
                  }
                  @if (order.changes.length) {
                    <div class="mt-1 ">
                      <span class="text-subtle">{{ text.note }}:</span>
                      @for (change of order.changes; track $index) {
                        <span class="block">{{ change }}</span>
                      }
                    </div>
                  }
                </dd>

                <!-- Which version this is, and what it was written for — the
                     two questions only this page is asked. -->
                <dt class="text-subtle">{{ text.heading }}</dt>
                <dd>
                  {{ written() }}
                  <p class="mt-1 text-subtle">{{ kindLabel() }}</p>
                </dd>

                <!-- And what the customer knows about it: whether this is the
                     version they are on, and whether they were written to. -->
                <dt class="text-subtle">
                  {{ detailText.tellCustomer.heading }}
                </dt>
                <dd>
                  {{ order.customerView ? text.customerView : customerSees() }}
                  @if (notified(); as notified) {
                    <p class="mt-1 text-subtle">{{ notified }}</p>
                  }
                </dd>
              </dl>
            </section>

            <app-order-read-back
              class="mt-8 max-w-xl"
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
            <!-- The way from reading to doing, under the card it was read
                 against: everything a manager does to an order is on that
                 page, and this one deliberately offers none of it. -->
            <a
              appButton
              class="mt-5 w-full"
              [routerLink]="['/admin/orders', reference()]"
            >
              {{ text.openControls }}
            </a>
            <a
              appButton
              variant="secondary"
              routerLink="/admin/orders"
              class="mt-3 w-full"
            >
              {{ detailText.back }}
            </a>
          </aside>
        </div>
      </div>
    } @else if (missing()) {
      <p class="text-muted">{{ detailText.notFound }}</p>
      <a appButton variant="secondary" routerLink="/admin/orders" class="mt-5">
        {{ detailText.back }}
      </a>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }
  `,
})
export class AdminOrderRevisionPage {
  private readonly api = inject(AdminOrdersService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = this.config.catalog.currency;
  private readonly appText = inject(APP_TEXT);

  protected readonly detailText = inject(ADMIN_TEXT).orderDetail;
  protected readonly listText = inject(ADMIN_TEXT).orderList;
  protected readonly text = this.detailText.revisions;

  readonly reference = input.required<string>();
  /** Bound from the route, and so a string: an unparsed segment. */
  readonly number = input.required<string>();

  private readonly loaded = resource({
    params: () => ({ reference: this.reference(), number: this.number() }),
    loader: ({ params }) =>
      this.api.revision(params.reference, Number(params.number)),
  });
  protected readonly showSkeleton = delayedLoading(this.loaded.isLoading);

  protected readonly revision = computed(() =>
    this.loaded.hasValue() ? this.loaded.value() : null,
  );
  /** Answered, and the answer was "no such version". Read through `hasValue`
   * so a page still loading is not a page that is not there. */
  protected readonly missing = computed(
    () =>
      this.loaded.error() != null ||
      (this.loaded.hasValue() && this.loaded.value() === null),
  );

  /** The customer's own reading of the lines, deliberately: this page shows
   * what they see, and basis units are the staff screen's business. */
  protected readonly lines = computed<ReadBackLine[]>(() => {
    const order = this.revision();
    if (!order) return [];
    return order.lines.map((line, index) => ({
      key: `${line.slug}-${index}`,
      name: line.name,
      note: line.note,
      href: line.linked ? `/product/${line.slug}` : null,
      quantity: customerQuantity(line, this.appText, this.currency),
      total: formatPriceMinor(line.lineTotalMinor, this.currency),
    }));
  });

  protected readonly blocks = computed<ReviewBlock[]>(() => {
    const order = this.revision();
    if (!order) return [];
    return orderBlocks(order, customerBlockLabels(this.appText), {
      address: this.config.address,
      phoneInput: this.config.phoneInput,
      locale: this.currency.locale,
    });
  });

  protected statusLabel(): string {
    const order = this.revision();
    if (!order) return '';
    return orderStatusLabel(
      order.status,
      order.fulfilmentMethod,
      this.listText,
    );
  }

  protected statusTone(): StatusTone {
    const order = this.revision();
    if (!order) return 'neutral';
    return orderStatusTone(order.status, 'staff', order.fulfilmentMethod);
  }

  /** When the order itself was placed, as its own page says it. */
  protected placed(): string {
    const order = this.revision();
    if (!order) return '';
    return fillText(this.detailText.placed, {
      date: this.dateTimeFormat.format(new Date(order.createdAt)),
    });
  }

  protected written(): string {
    const order = this.revision();
    if (!order) return '';
    return fillText(this.text.written, {
      number: order.revisionNumber,
      date: this.dateTimeFormat.format(new Date(order.revisionCreatedAt)),
      who:
        order.author ??
        (order.revisionNumber === 1
          ? this.text.authorCustomer
          : this.text.authorUnknown),
    });
  }

  protected kindLabel(): string {
    const kind = this.revision()?.kind;
    return kind ? revisionKindLabel(kind, this.text) : '';
  }

  protected kindTone(): StatusTone {
    return this.revision()?.kind === 'adjustment' ? 'waiting' : 'neutral';
  }

  protected customerSees(): string {
    const order = this.revision();
    if (!order) return '';
    return fillText(this.text.customerOn, {
      seen: order.customerRevisionNumber,
    });
  }

  protected notified(): string {
    const at = this.revision()?.notifiedAt;
    if (!at) return '';
    return fillText(this.text.notified, {
      date: this.dateTimeFormat.format(new Date(at)),
    });
  }

  protected paymentLabel(): string {
    const order = this.revision();
    if (!order) return '';
    const payment = this.detailText.paymentState;
    if (order.paymentState === 'awaiting') return payment.awaiting;
    if (order.paymentState !== 'paid') return payment.notDue;
    return fillText(payment.paid, {
      date: order.paidAt
        ? this.dateTimeFormat.format(new Date(order.paidAt))
        : '',
    });
  }

  protected paymentTone(): StatusTone {
    const state = this.revision()?.paymentState;
    if (state === 'paid') return 'ok';
    return state === 'awaiting' ? 'waiting' : 'neutral';
  }

  private readonly dateTimeFormat = orderDateTimeFormat(this.currency.locale);

  constructor() {
    usePageSeo({
      name: () => `${this.reference()} · ${this.number()}`,
      noindex: true,
    });
  }
}
