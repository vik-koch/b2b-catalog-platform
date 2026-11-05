import { SHARED_ORDERING_TEXT } from '../../core/ordering/ordering-text';
import { ADMIN_ORDERING_TEXT } from './ordering-text';
import { ACCOUNTS_CONFIG } from '../../core/accounts/accounts-config';
import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { useTaxStatement } from '../../platform/tax-statement';
import { RouterLink } from '@angular/router';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import {
  isOrderFinished,
  OrderStatus,
  AdminOrderDetail,
  AdminOrderLine,
} from '@b2b-catalog-platform/shared/core/ordering';
import {
  fillText,
  moneyFormat,
  formatMoneyMinor,
  shopTimeZone,
} from '@b2b-catalog-platform/shared/platform';
import { OrderSummary } from '../../core/ordering/ui/order-summary';
import { ADMIN_TEXT } from '../../platform/config/admin-text';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { delayedLoading } from '../../platform/delayed-loading';
import { usePageSeo } from '../../platform/page-seo';
import { orderBlocks } from '../../core/ordering/order-blocks';
import { staffBlockLabels } from './staff-block-labels';
import {
  OrderReadBack,
  ReadBackLine,
  ReviewBlock,
} from '../../core/ordering/ui/order-read-back';
import {
  orderStatusLabel,
  orderStatusTone,
} from '../../core/ordering/order-status';
import { orderDateTimeFormat } from '../../core/ordering/order-formats';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import {
  ConfirmService,
  confirmRequest,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { AuthService } from '../../platform/auth/auth.service';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import { LockedNote } from '../platform/ownership/ui/locked-note';
import { OwnershipService } from '../platform/ownership/ownership.service';
import { OrderDocumentsPanel } from './order-documents-panel';
import { OrderCustomerSync } from './order-customer-sync';
import { OrderVersionHistory } from './order-version-history';
import { moveOptions, moveRequest, staffMoves } from './order-moves';
import { AdminOrdersService } from './orders.service';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { rotateCcwIcon } from '@b2b-catalog-platform/ui/icons/glyphs/rotate-ccw';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { Card } from '@b2b-catalog-platform/ui/content/card';
import { FACT_LIST } from '@b2b-catalog-platform/ui/content/fact-list';
import { SummaryLayout } from '@b2b-catalog-platform/ui/content/summary-layout';

/**
 * One order as staff read it (FR-AUTH-03): the customer's page plus the price
 * list, the account and the lines in pieces (FR-UNIT-04). Also where it is
 * answered (FR-ORD-01/02/04); the moves come from the shared transition table
 * the API refuses by.
 */
@Component({
  selector: 'app-admin-order-detail-page',
  imports: [
    SummaryLayout,
    FACT_LIST,
    Card,
    RouterLink,
    Icon,
    Button,
    Link,
    OrderCustomerSync,
    OrderVersionHistory,
    OrderDocumentsPanel,
    Skeleton,
    OrderReadBack,
    OrderSummary,
    StatusBadge,
    LockedNote,
    PageTitle,
    ErrorText,
  ],
  template: `
    @if (detail(); as order) {
      <ui-summary-layout track="fill">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 uiPageTitle>
              {{ order.reference }}
            </h1>
          </div>
          <p class="mt-2 text-ink-subtle">{{ placed(order) }}</p>

          <!-- Above the controls it explains: a card that silently lost its
                 buttons teaches nobody. -->
          @if (locked()) {
            <app-locked-note class="mt-4">{{
              ownershipText.orderLocked
            }}</app-locked-note>
          }

          <!-- What only staff see and do. Each control sits under the fact it
                 changes. -->
          <section uiCard class="mt-4 text-sm">
            <dl uiFactList terms="narrow">
              <dt uiFactTerm>{{ ordersText.account }}</dt>
              <dd uiFactValue>
                {{ order.customerEmail ?? ordersText.guest }}
                <!-- A guest's mailed link: the page they mean when they ring.
                       An account holder's version is linked below. -->
                @if (order.publicToken; as token) {
                  <a
                    uiLink
                    class="ml-2"
                    [routerLink]="['/orders', token]"
                    target="_blank"
                    >{{ text.guestView }}</a
                  >
                }
              </dd>
              <!-- Under the owner, whose details they are (NFR-LEGAL-14);
                     only where removed or removable. -->
              @if (personalData(); as data) {
                <dt uiFactTerm>{{ text.personalData.heading }}</dt>
                <dd uiFactValue class="flex flex-col gap-3">
                  <p class="min-w-0">{{ data.label }}</p>
                  @if (data.removable) {
                    <div [class]="actions">
                      <button
                        uiButton
                        size="sm"
                        variant="secondary"
                        type="button"
                        class="w-full gap-2 sm:w-auto"
                        [disabled]="busy()"
                        (click)="removePersonalData(order)"
                      >
                        <ui-icon [glyph]="trash2Icon" class="size-4" />
                        {{ text.personalData.remove }}
                      </button>
                    </div>
                  }
                </dd>
              }
              <dt uiFactTerm>{{ ordersText.tier }}</dt>
              <dd uiFactValue>
                {{ order.tierKey ?? ordersText.tierDefault }}
              </dd>
              @if (termsLabel(order); as terms) {
                <dt uiFactTerm>{{ pageNames.terms }}</dt>
                <dd uiFactValue>{{ terms }}</dd>
              }

              <!-- Money before the status: recording a payment moves nothing
                     along. -->
              <dt uiFactTerm>{{ names.payment }}</dt>
              <dd uiFactValue class="flex flex-col gap-3">
                <p class="min-w-0">
                  {{ paymentLabel(order) }}
                </p>
                @if (paymentMove(); as move) {
                  <div [class]="actions">
                    <button
                      uiButton
                      size="sm"
                      variant="secondary"
                      type="button"
                      class="w-full gap-2 sm:w-auto"
                      [disabled]="busy()"
                      (click)="move.run()"
                    >
                      <ui-icon [glyph]="move.icon" class="size-4" />
                      {{ move.label }}
                    </button>
                  </div>
                }
              </dd>

              <dt uiFactTerm>{{ names.status }}</dt>
              <dd uiFactValue class="flex flex-col gap-3">
                <div class="min-w-0">
                  <!-- Beside the badge, wrapping under it. -->
                  <div class="flex flex-wrap items-center gap-x-2">
                    <span uiStatusBadge [tone]="statusTone(order)">
                      {{ statusLabel(order) }}
                    </span>
                    <span class="text-ink-subtle">{{
                      statusChanged(order)
                    }}</span>
                  </div>
                  <!-- The reason is part of the status. -->
                  @if (order.statusReason; as reason) {
                    <p class="mt-1">
                      <span class="text-ink-subtle">{{ names.reason }}:</span>
                      {{ reason }}
                    </p>
                  }
                  <!-- The current version's change note; the thread below is
                         the history. -->
                  @if (order.changes.length) {
                    <div class="mt-1 ">
                      <span class="text-ink-subtle"
                        >{{ names.changeNote }}:</span
                      >
                      @for (change of order.changes; track $index) {
                        <span class="block">{{ change }}</span>
                      }
                    </div>
                  }
                </div>

                <!-- No controls while answered elsewhere or erased: no empty
                       strip. -->
                @if (!locked() && !order.personalDataRemovedAt) {
                  <div [class]="actions">
                    <!-- Changing the order is the other half of answering it,
                           offered in any status. A link: it opens a form. -->
                    <a
                      uiButton
                      size="sm"
                      variant="secondary"
                      class="w-full gap-2 sm:w-auto"
                      [routerLink]="[
                        '/admin/orders',
                        order.reference,
                        'adjust',
                      ]"
                    >
                      <ui-icon [glyph]="pencilIcon" class="size-4" />
                      {{ text.actions.adjust }}
                    </a>

                    <!-- The glyph says which way: down the chain, back up, or
                           off. No bin: orders are never deleted. -->
                    @for (step of moves(); track step.to) {
                      <button
                        uiButton
                        size="sm"
                        type="button"
                        class="w-full gap-2 sm:w-auto"
                        [variant]="step.variant"
                        [disabled]="busy()"
                        (click)="move(order, step.to)"
                      >
                        <ui-icon [glyph]="step.icon" class="size-4" />
                        {{ step.label }}
                      </button>
                    }
                  </div>
                }
              </dd>

              <!-- Their page and their mail, two questions, always shown:
                     either can be left undone. -->
              <dt uiFactTerm>{{ tellText.heading }}</dt>
              <dd uiFactValue>
                <app-order-customer-sync
                  [order]="order"
                  [locked]="locked()"
                  [busy]="busy()"
                  [actionsClass]="actions"
                  (notify)="tellCustomer(order, $event)"
                />
              </dd>

              <!-- Documents (FR-ORD-05): supplied while answering, so here.
                     -->
              <dt uiFactTerm>{{ documentsText.heading }}</dt>
              <dd uiFactValue>
                <app-order-documents-panel
                  [order]="order"
                  [readOnly]="locked()"
                  (changed)="reload()"
                />
              </dd>

              <!-- Every version, newest first (FR-ORD-03), with its note and
                     difference. Only where there is more than one. -->
              @if (order.revisionNumber > 1) {
                <dt uiFactTerm>{{ revisionText.heading }}</dt>
                <dd uiFactValue>
                  <app-order-version-history [order]="order" />
                </dd>
              }
            </dl>
          </section>

          @if (failed(); as message) {
            <p uiErrorText class="mt-3 max-w-xl" role="alert">
              {{ message }}
            </p>
          }

          <!-- The order as it reads, under the block: answered first, checked
                 second. -->
          <app-order-read-back
            class="mt-8 max-w-xl"
            [itemsHeading]="ordersText.items"
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
          <a
            uiButton
            variant="secondary"
            routerLink="/admin/orders"
            class="mt-5 w-full"
          >
            {{ text.back }}
          </a>
        </aside>
      </ui-summary-layout>
    } @else if (missing()) {
      <p class="text-ink-subtle">{{ ordersText.notFound }}</p>
      <a uiButton variant="secondary" routerLink="/admin/orders" class="mt-5">
        {{ text.back }}
      </a>
    } @else if (order.error()) {
      <p class="text-ink-subtle" role="alert">{{ ordersText.loadError }}</p>
      <a uiButton variant="secondary" routerLink="/admin/orders" class="mt-5">
        {{ text.back }}
      </a>
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="6" />
    }
  `,
})
export class AdminOrderDetailPage {
  protected readonly pencilIcon = pencilIcon;
  protected readonly trash2Icon = trash2Icon;
  private readonly api = inject(AdminOrdersService);
  private readonly ownership = inject(OwnershipService);
  private readonly confirm = inject(ConfirmService);
  private readonly auth = inject(AuthService);
  private readonly isAdmin = computed(() => this.auth.user()?.role === 'admin');
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly accountsConfig = inject(ACCOUNTS_CONFIG);
  private readonly currency = moneyFormat(this.config);

  protected readonly text = inject(ADMIN_ORDERING_TEXT).orders.detail;
  protected readonly ordersText = inject(ADMIN_ORDERING_TEXT).orders;
  private readonly sharedOrderingText = inject(SHARED_ORDERING_TEXT);
  protected readonly names = this.sharedOrderingText.order;
  protected readonly pageNames = inject(SHARED_TEXT).nav;
  private readonly sharedText = inject(SHARED_TEXT);
  protected readonly revisionText = this.text.revisions;
  protected readonly documentsText = this.text.documents;
  protected readonly tellText = this.text.tellCustomer;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  /** Whether an external system answers orders (FR-ADM-10); in flight counts as
   * not owned. Every control's computed returns nothing then: one rule, not a
   * condition per button. */
  protected readonly locked = computed(() => this.ownership.owns('orders'));
  /** As wide as their words from `sm`, wrapping; full-width stacked below.
   * Their own space beneath: a button group needs more air. */
  protected readonly actions =
    'mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap';

  readonly reference = input.required<string>();

  protected readonly order = resource({
    params: () => this.reference(),
    loader: ({ params }) => this.api.get(params),
  });
  protected readonly showSkeleton = delayedLoading(this.order.isLoading);

  /** Through `hasValue`: an errored resource throws from `value()`. */
  protected readonly detail = computed(() =>
    this.order.hasValue() ? this.order.value() : null,
  );
  protected readonly missing = computed(
    () => this.order.hasValue() && this.order.value() === null,
  );

  private readonly tax = useTaxStatement();
  /** What the total names (NFR-LEGAL-11). */
  protected readonly taxRates = computed(
    () => this.detail()?.lines.map((line) => line.taxRate) ?? [],
  );

  protected readonly lines = computed<ReadBackLine[]>(() => {
    const order = this.detail();
    if (!order) return [];
    return order.lines.map((line, index) => ({
      key: `${line.slug}-${index}`,
      name: line.name,
      note: line.note,
      href: line.linked ? `/product/${line.slug}` : null,
      quantity: this.pieceLine(line),
      total: formatMoneyMinor(line.lineTotalMinor, this.currency),
      // Always for staff: a line reconciles against the invoice by it.
      taxRate: this.tax.line(line.taxRate) || null,
    }));
  });

  protected readonly blocks = computed<ReviewBlock[]>(() => {
    const order = this.detail();
    if (!order) return [];
    return orderBlocks(
      order,
      staffBlockLabels(this.sharedOrderingText, this.ordersText, this.text),
      {
        address: this.accountsConfig.address,
        phoneInput: this.config.phoneInput,
        locale: this.config.locale,
      },
    );
  });

  /** In pieces, "100 × 0.42": the source system prices per piece. */
  private pieceLine(line: AdminOrderLine): string {
    return fillText(this.text.pieceLine, {
      count: line.pieces,
      price: formatMoneyMinor(line.priceMinor, this.currency),
    });
  }

  /** The terms versions, as the page editor lists them. */
  protected termsLabel(order: AdminOrderDetail): string | null {
    if (order.termsVersion === null || order.termsDate === null) return null;
    return fillText(this.ordersText.termsVersion, {
      version: order.termsVersion,
      date: this.shopDayFormat.format(new Date(order.termsDate)),
    });
  }

  protected placed(order: AdminOrderDetail): string {
    return fillText(this.text.placed, {
      date: this.dateFormat.format(new Date(order.createdAt)),
    });
  }

  /** To the minute: the order keeps no move history (the audit log does), and
   * two moves in an afternoon must differ. */
  protected statusChanged(order: AdminOrderDetail): string {
    return this.dateTimeFormat.format(new Date(order.statusChangedAt));
  }

  protected statusLabel(order: AdminOrderDetail): string {
    return orderStatusLabel(
      order.status,
      order.fulfilmentMethod,
      this.ordersText.statuses,
    );
  }

  protected statusTone(order: AdminOrderDetail): StatusTone {
    return orderStatusTone(order.status, 'staff', order.fulfilmentMethod);
  }

  protected paymentLabel(order: AdminOrderDetail): string {
    const states = this.ordersText.paymentStates;
    if (order.paymentState === 'awaiting') return states.awaiting;
    if (order.paymentState !== 'paid') return states.notDue;
    return fillText(this.text.paymentState.paid, {
      date: order.paidAt
        ? this.dateTimeFormat.format(new Date(order.paidAt))
        : '',
    });
  }

  /** About the page, not the order, so not on the resource. */
  protected readonly busy = signal(false);
  protected readonly failed = signal<string | null>(null);

  /** The staff moves, or none while answered elsewhere. */
  protected readonly moves = computed(() => {
    const order = this.detail();
    return order && !this.locked() ? staffMoves(order, this.text) : [];
  });

  /** A refusal means somebody else answered first: reload. */
  protected async move(
    order: AdminOrderDetail,
    to: OrderStatus,
  ): Promise<void> {
    const answer = await this.confirm.askDetailed(
      moveRequest(order, to, this.text),
    );
    if (!answer) return;
    await this.run(
      () =>
        this.api.transition(
          order.reference,
          to,
          answer.reason || null,
          moveOptions(answer),
        ),
      this.text.actions.error,
    );
  }

  protected async tellCustomer(
    order: AdminOrderDetail,
    notify: boolean,
  ): Promise<void> {
    await this.run(
      () => this.api.notifyCustomer(order.reference, notify),
      this.tellText.error,
    );
  }

  /** Records the payment or takes it back: a mis-tick must not stand. Not a
   * refund. Not offered on an order that ended unfilled. */
  protected readonly paymentMove = computed(() => {
    const order = this.detail();
    if (!order || this.locked()) return null;
    const ended = order.status === 'declined' || order.status === 'cancelled';
    if (ended) return null;
    const payment = this.text.paymentState;
    const paid = order.paymentState === 'paid';
    return {
      label: paid ? payment.clear : payment.record,
      // Clearing wears the admin's undo mark.
      icon: paid ? rotateCcwIcon : circleCheckIcon,
      run: () => this.setPayment(order, !paid),
    };
  });

  /** Personal details (NFR-LEGAL-14): when removed, or on a finished guest
   * order the way to remove them. Not on a running order or one with an account
   * (erased with it). Offered while owned elsewhere: the guest's right outranks
   * that. */
  protected readonly personalData = computed(() => {
    const order = this.detail();
    if (!order) return null;
    const text = this.text.personalData;
    if (order.personalDataRemovedAt) {
      return {
        label: fillText(text.removed, {
          date: this.dateFormat.format(new Date(order.personalDataRemovedAt)),
        }),
        removable: false,
      };
    }
    const guest = order.customerEmail === null;
    if (
      !guest ||
      !this.isAdmin() ||
      !isOrderFinished(order.status, order.paymentState)
    ) {
      return null;
    }
    return { label: text.kept, removable: true };
  });

  protected async removePersonalData(order: AdminOrderDetail): Promise<void> {
    const text = this.text.personalData;
    const confirmed = await this.confirm.ask({
      ...confirmRequest(text.confirm),
      message: fillText(text.confirm.message, { reference: order.reference }),
      warning: text.confirm.warning,
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    await this.run(
      () => this.api.removePersonalData(order.reference),
      text.error,
    );
  }

  private async setPayment(
    order: AdminOrderDetail,
    paid: boolean,
  ): Promise<void> {
    const payment = this.text.paymentState;
    const confirmed = await this.confirm.ask({
      ...confirmRequest(paid ? payment.recordConfirm : payment.clearConfirm),
      confirmVariant: 'primary',
    });
    if (!confirmed) return;

    await this.run(
      () => this.api.setPayment(order.reference, paid),
      payment.error,
    );
  }

  /** Runs it, says where refused, reloads. */
  private async run(
    call: () => Promise<AdminOrderDetail | null>,
    error: string,
  ): Promise<void> {
    this.busy.set(true);
    this.failed.set(null);
    try {
      const updated = await call();
      if (!updated) this.failed.set(error);
    } finally {
      this.busy.set(false);
      // The version history refetches with the reloaded order.
      this.order.reload();
    }
  }

  /** A document writes no version, so only the order reloads. */
  protected reload(): void {
    this.order.reload();
  }

  private readonly dateFormat = new Intl.DateTimeFormat(this.config.locale, {
    dateStyle: 'long',
  });

  /** In the shop's timezone. */
  private readonly shopDayFormat = new Intl.DateTimeFormat(this.config.locale, {
    dateStyle: 'long',
    timeZone: shopTimeZone(this.config),
  });

  /** For the last move and the payment record: moments, not days. */
  private readonly dateTimeFormat = orderDateTimeFormat(this.config.locale);

  constructor() {
    void this.ownership.load();
    usePageSeo({ name: () => this.reference() });
  }
}
