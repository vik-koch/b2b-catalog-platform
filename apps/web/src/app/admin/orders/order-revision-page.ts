import { Component, computed, inject, input, resource } from '@angular/core';
import { useTaxStatement } from '../../shared/catalog/tax-statement';
import { RouterLink } from '@angular/router';
import { fillText, moneyFormat } from '@b2b-catalog-platform/shared';
import { OrderSummary } from '../../shared/cart/order-summary';
import { formatPriceMinor } from '../../shared/catalog/price';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { usePageSeo } from '../../shared/core/page-seo';
import {
  injectCustomerBlockLabels,
  orderBlocks,
} from '../../shared/orders/order-blocks';
import {
  OrderReadBack,
  ReadBackLine,
  ReviewBlock,
} from '../../shared/orders/order-read-back';
import {
  orderStatusLabel,
  orderStatusTone,
} from '../../shared/orders/order-status';
import {
  customerQuantity,
  orderDateTimeFormat,
} from '../../shared/orders/order-view';
import { Button } from '../../shared/ui/button';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatusBadge, StatusTone } from '../../shared/ui/status-badge';
import { AdminOrdersService } from './orders.service';
import { SettingsService } from '../settings/settings.service';
import { OrderDocumentsPanel } from './order-documents-panel';
import { revisionKindLabel } from './revision-labels';
import { PageTitle } from '../../shared/ui/page-title';

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
    OrderDocumentsPanel,
    StatusBadge,
    PageTitle,
  ],
  template: `
    @if (revision(); as order) {
      <div class="@container/order">
        <div
          class="grid gap-10 @min-[63.75rem]/order:grid-cols-[1fr_20rem] @min-[63.75rem]/order:justify-between"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 appPageTitle>
                {{ order.reference }}
              </h1>
              <span appStatusBadge [tone]="statusTone()">
                {{ statusLabel() }}
              </span>
            </div>
            <p class="mt-2 text-subtle">{{ placed() }}</p>

            <!-- The same block staff read on the order itself, and
                 deliberately the same: what only staff see, in the shape they
                 see it in everywhere else. Without a single control — this
                 page reads a version, and a version already superseded is not
                 a thing to press buttons at. -->
            <section class="mt-4 rounded-lg border border-edge p-5 text-sm">
              <dl
                class="grid gap-x-6 gap-y-3 wrap-break-word sm:grid-cols-[7rem_1fr]"
              >
                <dt class="text-subtle">{{ ordersText.account }}</dt>
                <dd>{{ order.customerEmail ?? ordersText.guest }}</dd>
                <dt class="text-subtle">{{ ordersText.tier }}</dt>
                <dd>{{ order.tierKey ?? ordersText.tierDefault }}</dd>

                <dt class="text-subtle">
                  {{ names.payment }}
                </dt>
                <dd>{{ paymentLabel() }}</dd>

                <dt class="text-subtle">{{ names.status }}</dt>
                <dd class="min-w-0">
                  <span appStatusBadge [tone]="statusTone()">
                    {{ statusLabel() }}
                  </span>
                  @if (order.statusReason; as reason) {
                    <p class="mt-1">
                      <span class="text-subtle"> {{ names.reason }}: </span>
                      {{ reason }}
                    </p>
                  }
                  @if (order.changes.length) {
                    <div class="mt-1 ">
                      <span class="text-subtle">{{ names.changeNote }}:</span>
                      @for (change of order.changes; track $index) {
                        <span class="block">{{ change }}</span>
                      }
                    </div>
                  }
                </dd>

                <!-- What the customer knows about this version: whether it
                     is the one they are on, and whether they were written to.
                     Above the version row, as it is on the order itself — the
                     two blocks list the same facts in the same order. -->
                <dt class="text-subtle">
                  {{ detailText.tellCustomer.heading }}
                </dt>
                <dd>
                  {{ order.customerView ? text.customerView : customerSees() }}
                  @if (notified(); as notified) {
                    <p class="mt-1 text-subtle">{{ notified }}</p>
                  }
                </dd>

                <!-- Which version this is, and what it was written for — the
                     two questions only this page is asked. -->
                <dt class="text-subtle">{{ text.heading }}</dt>
                <dd>
                  {{ written() }}
                  <p class="mt-1 text-subtle">{{ kindLabel() }}</p>
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
              [taxRates]="taxRates()"
              [taxBasis]="order.taxBasis"
            />
            <!-- What can be opened on this version (FR-ORD-05), marked from
                 where this page stands: a supplied file filed before this
                 version is stale *here* even where the order has since caught
                 up with it. Read-only, like everything else on this screen.

                 Under the total and above the way out, which is where every
                 other order screen puts it — a document is a copy of what has
                 just been read, and the controls stay last. -->
            @if (order.documents.length) {
              <section class="mt-5 rounded-lg border border-edge p-5">
                <h2 class="font-medium">{{ documentsText.heading }}</h2>
                <div class="mt-1 text-sm">
                  <app-order-documents-panel
                    [order]="order"
                    [readOnly]="true"
                  />
                </div>
              </section>
            }

            <!-- The way from reading to doing, under the card it was read
                 against: everything a manager does to an order is on that
                 page, and this one deliberately offers none of it. Where there
                 is nothing to do, it still leads somewhere — the order as it
                 now stands — and says so instead. -->
            <a
              appButton
              class="mt-5 w-full"
              [routerLink]="['/admin/orders', reference()]"
            >
              {{ locked() ? text.openOrder : text.openControls }}
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
      <p class="text-subtle">{{ ordersText.notFound }}</p>
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
  private readonly ownership = inject(SettingsService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = moneyFormat(this.config);
  private readonly customerLabels = injectCustomerBlockLabels();

  protected readonly detailText = inject(ADMIN_TEXT).orders.detail;
  protected readonly ordersText = inject(ADMIN_TEXT).orders;
  private readonly sharedText = inject(SHARED_TEXT);
  protected readonly names = this.sharedText.order;
  protected readonly text = this.detailText.revisions;
  protected readonly documentsText = this.detailText.documents;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  /** Whether an external system answers orders (FR-ADM-10). This page never
   * had controls to take away; what it has is a link that promised some. */
  protected readonly locked = computed(() => this.ownership.owns('orders'));

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
  private readonly tax = useTaxStatement();
  /** What the total names, or why it names only the basis (NFR-LEGAL-11). */
  protected readonly taxRates = computed(
    () => this.revision()?.lines.map((line) => line.taxRate) ?? [],
  );

  protected readonly lines = computed<ReadBackLine[]>(() => {
    const order = this.revision();
    if (!order) return [];
    return order.lines.map((line, index) => ({
      key: `${line.slug}-${index}`,
      name: line.name,
      note: line.note,
      href: line.linked ? `/product/${line.slug}` : null,
      quantity: customerQuantity(line, this.sharedText, this.currency),
      total: formatPriceMinor(line.lineTotalMinor, this.currency),
      // Always, for staff: the rate is what a line reconciles against the
      // shop's own invoice by, shared with its neighbours or not.
      taxRate: this.tax.line(line.taxRate) || null,
    }));
  });

  protected readonly blocks = computed<ReviewBlock[]>(() => {
    const order = this.revision();
    if (!order) return [];
    return orderBlocks(order, this.customerLabels, {
      address: this.config.address,
      phoneInput: this.config.phoneInput,
      locale: this.config.locale,
    });
  });

  protected statusLabel(): string {
    const order = this.revision();
    if (!order) return '';
    return orderStatusLabel(
      order.status,
      order.fulfilmentMethod,
      this.ordersText.statuses,
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
      date: this.dateFormat.format(new Date(order.createdAt)),
    });
  }

  protected written(): string {
    const order = this.revision();
    if (!order) return '';
    return fillText(this.text.written, {
      number: order.revisionNumber,
      date: this.dateTimeFormat.format(new Date(order.revisionCreatedAt)),
      who:
        // A person here, then the outside system that wrote it, then the two
        // versions nobody signed (FR-ADM-08).
        order.author ??
        order.source ??
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
    const states = this.ordersText.paymentStates;
    if (order.paymentState === 'awaiting') return states.awaiting;
    if (order.paymentState !== 'paid') return states.notDue;
    return fillText(this.detailText.paymentState.paid, {
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

  private readonly dateTimeFormat = orderDateTimeFormat(this.config.locale);
  private readonly dateFormat = new Intl.DateTimeFormat(this.config.locale, {
    dateStyle: 'long',
  });

  constructor() {
    void this.ownership.load();
    usePageSeo({
      name: () => `${this.reference()} · ${this.number()}`,
      noindex: true,
    });
  }
}
