import { Component, computed, inject, input, resource } from '@angular/core';
import { useTaxStatement } from '../../core/catalog/pricing/tax-statement';
import { RouterLink } from '@angular/router';
import {
  fillText,
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared';
import { OrderSummary } from '../../core/ordering/ui/order-summary';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { usePageSeo } from '../../shared/core/page-seo';
import {
  injectCustomerBlockLabels,
  orderBlocks,
} from '../../core/ordering/order-blocks';
import {
  OrderReadBack,
  ReadBackLine,
  ReviewBlock,
} from '../../core/ordering/ui/order-read-back';
import {
  orderStatusLabel,
  orderStatusTone,
} from '../../core/ordering/order-status';
import {
  customerQuantity,
  orderDateTimeFormat,
} from '../../core/ordering/order-formats';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import { AdminOrdersService } from './orders.service';
import { OwnershipService } from '../settings/ownership.service';
import { OrderDocumentsPanel } from './order-documents-panel';
import { revisionKindLabel } from './revision-labels';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { Card } from '@b2b-catalog-platform/ui/content/card';
import { SummaryLayout } from '@b2b-catalog-platform/ui/content/summary-layout';

/** One version read back (FR-ORD-03): **the customer's page on a staff
 * screen**, plus which version it is, which they are shown, and the money. No
 * controls: those are on the order page, one route up. */
@Component({
  selector: 'app-admin-order-revision-page',
  imports: [
    SummaryLayout,
    Card,
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
      <ui-summary-layout track="fill">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 uiPageTitle>
              {{ order.reference }}
            </h1>
            <span uiStatusBadge [tone]="statusTone()">
              {{ statusLabel() }}
            </span>
          </div>
          <p class="mt-2 text-ink-subtle">{{ placed() }}</p>

          <!-- The order page's staff block, without controls. -->
          <section uiCard class="mt-4 text-sm">
            <dl
              class="grid gap-x-6 gap-y-3 wrap-break-word
                     sm:grid-cols-[7rem_1fr]"
            >
              <dt class="text-ink-subtle">{{ ordersText.account }}</dt>
              <dd>{{ order.customerEmail ?? ordersText.guest }}</dd>
              <dt class="text-ink-subtle">{{ ordersText.tier }}</dt>
              <dd>{{ order.tierKey ?? ordersText.tierDefault }}</dd>

              <dt class="text-ink-subtle">
                {{ names.payment }}
              </dt>
              <dd>{{ paymentLabel() }}</dd>

              <dt class="text-ink-subtle">{{ names.status }}</dt>
              <dd class="min-w-0">
                <span uiStatusBadge [tone]="statusTone()">
                  {{ statusLabel() }}
                </span>
                @if (order.statusReason; as reason) {
                  <p class="mt-1">
                    <span class="text-ink-subtle"> {{ names.reason }}: </span>
                    {{ reason }}
                  </p>
                }
                @if (order.changes.length) {
                  <div class="mt-1 ">
                    <span class="text-ink-subtle">{{ names.changeNote }}:</span>
                    @for (change of order.changes; track $index) {
                      <span class="block">{{ change }}</span>
                    }
                  </div>
                }
              </dd>

              <!-- What the customer knows, above the version row as on the
                     order page. -->
              <dt class="text-ink-subtle">
                {{ detailText.tellCustomer.heading }}
              </dt>
              <dd>
                {{ order.customerView ? text.customerView : customerSees() }}
                @if (notified(); as notified) {
                  <p class="mt-1 text-ink-subtle">{{ notified }}</p>
                }
              </dd>

              <!-- The two questions only this page is asked. -->
              <dt class="text-ink-subtle">{{ text.heading }}</dt>
              <dd>
                {{ written() }}
                <p class="mt-1 text-ink-subtle">{{ kindLabel() }}</p>
              </dd>
            </dl>
          </section>

          <app-order-read-back
            class="mt-8 max-w-xl"
            [lines]="lines()"
            [blocks]="blocks()"
          />
        </div>

        <aside summary>
          <app-order-summary
            [lineCount]="order.lines.length"
            [subtotalMinor]="order.totalMinor"
            [shipment]="order.shipment"
            [taxRates]="taxRates()"
            [taxBasis]="order.taxBasis"
          />
          <!-- Documents (FR-ORD-05), stale as of this version; read-only. -->
          @if (order.documents.length) {
            <section uiCard class="mt-5">
              <h2 class="font-medium">{{ documentsText.heading }}</h2>
              <div class="mt-1 text-sm">
                <app-order-documents-panel [order]="order" [readOnly]="true" />
              </div>
            </section>
          }

          <!-- The way to the order page, which does everything; otherwise to
                 the order as it stands. -->
          <a
            uiButton
            class="mt-5 w-full"
            [routerLink]="['/admin/orders', reference()]"
          >
            {{ locked() ? text.openOrder : text.openControls }}
          </a>
          <a
            uiButton
            variant="secondary"
            routerLink="/admin/orders"
            class="mt-3 w-full"
          >
            {{ detailText.back }}
          </a>
        </aside>
      </ui-summary-layout>
    } @else if (missing()) {
      <p class="text-ink-subtle">{{ ordersText.notFound }}</p>
      <a uiButton variant="secondary" routerLink="/admin/orders" class="mt-5">
        {{ detailText.back }}
      </a>
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="6" />
    }
  `,
})
export class AdminOrderRevisionPage {
  private readonly api = inject(AdminOrdersService);
  private readonly ownership = inject(OwnershipService);
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
  /** Whether an external system answers orders (FR-ADM-10): only the link's
   * wording changes. */
  protected readonly locked = computed(() => this.ownership.owns('orders'));

  readonly reference = input.required<string>();
  /** From the route, so a string. */
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
  /** "No such version", not still loading. */
  protected readonly missing = computed(
    () =>
      this.loaded.error() != null ||
      (this.loaded.hasValue() && this.loaded.value() === null),
  );

  /** The customer's reading: pieces are the order page's. */
  private readonly tax = useTaxStatement();
  /** What the total names (NFR-LEGAL-11). */
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
      total: formatMoneyMinor(line.lineTotalMinor, this.currency),
      // Always for staff: a line reconciles against the invoice by it.
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
        // A person, then the external system, then the unsigned (FR-ADM-08).
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
