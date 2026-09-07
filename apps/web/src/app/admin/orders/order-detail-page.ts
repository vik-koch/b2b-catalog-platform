import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AdminOrderDetail,
  AdminOrderLine,
  allowedTransitions,
  DIRECT_TRANSITION_TARGETS,
  fillText,
  ORDER_STATUS_REASON_MAX,
  transitionHasReason,
  TransitionTarget,
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
import { StatusBadge, StatusTone } from '../../ui/status-badge';
import { orderStatusLabel, orderStatusTone } from '../../orders/order-status';
import { ConfirmService } from '../../ui/confirm.service';
import { AdminOrdersService } from './orders.service';

/**
 * One order as staff read it (FR-AUTH-03) — the customer's own page plus what
 * they must never see: which price list it was taken from, whose account it
 * came from, and the lines in **basis units** (FR-UNIT-04), which is what the
 * source system prices in.
 *
 * And where an order is answered (FR-ORD-01/02/04). Which moves are offered
 * is the shared transition table's answer, not this page's: the API refuses by
 * the same table, so a button drawn here is a button the server honours.
 */
@Component({
  selector: 'app-admin-order-detail-page',
  imports: [
    RouterLink,
    Button,
    Skeleton,
    OrderReadBack,
    OrderSummary,
    StatusBadge,
  ],
  template: `
    @if (detail(); as order) {
      <!-- The notch the customer's own order page folds at, measured on the
           page rather than the window: the same order must not sit beside its
           card for staff and under it for the customer at one width. -->
      <div class="@container/order">
        <div
          class="grid gap-10 @min-[63.75rem]/order:grid-cols-[1fr_20rem] @min-[63.75rem]/order:justify-between"
        >
          <!-- The track is the measure: an order is read down its left edge,
               and a name-and-price line spanning a wide screen is one nobody
               follows across. The same 36rem the cart gives its lines and the
               checkout its form, so the card beside it lands in one place on
               all three. -->
          <div>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 class="text-3xl font-medium tracking-tight">
                {{ order.reference }}
              </h1>
            </div>
            <p class="mt-2 text-muted">{{ placed(order) }}</p>
            <!--
        What only staff see, and what only staff do, in one block: whose the
        order is, what it was priced from, where it stands and what it owes —
        each with its own controls on its own line. The buttons sit on the axis
        of the fact they change, so answering an order is reading a line and
        acting on it rather than reading here and acting somewhere below.
      -->
            <dl
              class="mt-6 grid gap-x-8 gap-y-3 rounded-lg border border-border p-5 text-sm break-words sm:grid-cols-[10rem_1fr]"
            >
              <dt class="text-subtle">{{ text.customer }}</dt>
              <dd>{{ order.customerEmail ?? listText.guest }}</dd>
              <dt class="text-subtle">{{ text.tier }}</dt>
              <dd>{{ order.tierKey ?? text.tierDefault }}</dd>

              <dt class="text-subtle">{{ listText.status }}</dt>
              <dd
                class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2"
              >
                <div class="min-w-0">
                  <span appStatusBadge [tone]="statusTone(order)">
                    {{ statusLabel(order) }}
                  </span>
                  <p class="mt-1 text-subtle">{{ statusChanged(order) }}</p>
                  <!-- Why it ended, on the line that says it ended: the reason is
                 part of the status and not a fact of its own. -->
                  @if (order.statusReason; as reason) {
                    <p class="mt-1">
                      <span class="text-subtle">{{ text.statusReason }}:</span>
                      {{ reason }}
                    </p>
                  }
                </div>
                @if (moves().length) {
                  <div class="flex flex-wrap justify-end gap-2">
                    @for (move of moves(); track move.to) {
                      <button
                        appButton
                        size="sm"
                        type="button"
                        [variant]="move.variant"
                        [disabled]="busy()"
                        (click)="move.run()"
                      >
                        {{ move.label }}
                      </button>
                    }
                  </div>
                }
              </dd>

              <dt class="text-subtle">{{ text.paymentState.heading }}</dt>
              <dd
                class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2"
              >
                <span>{{ paymentLabel(order) }}</span>
                @if (paymentMove(); as move) {
                  <button
                    appButton
                    size="sm"
                    variant="secondary"
                    type="button"
                    [disabled]="busy()"
                    (click)="move.run()"
                  >
                    {{ move.label }}
                  </button>
                }
              </dd>
            </dl>
            @if (failed(); as message) {
              <p class="mt-3 text-sm text-red-600" role="alert">
                {{ message }}
              </p>
            }
            <app-order-read-back
              class="max-w-xl mt-8"
              [itemsHeading]="text.items"
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
            <a
              appButton
              variant="secondary"
              routerLink="/admin/orders"
              class="mt-5 w-full"
            >
              {{ text.back }}
            </a>
          </aside>
        </div>
      </div>
    } @else if (missing()) {
      <p class="text-muted">{{ text.notFound }}</p>
      <a appButton variant="secondary" routerLink="/admin/orders" class="mt-5">
        {{ text.back }}
      </a>
    } @else if (order.error()) {
      <p class="text-muted" role="alert">{{ text.loadError }}</p>
      <a appButton variant="secondary" routerLink="/admin/orders" class="mt-5">
        {{ text.back }}
      </a>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }
  `,
})
export class AdminOrderDetailPage {
  private readonly api = inject(AdminOrdersService);
  private readonly confirm = inject(ConfirmService);
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

  /**
   * When the order last moved, to the minute. Nothing records the moves before
   * this one — an order carries where it stands, not how it got there (the
   * audit log is that record) — so this timestamp is the whole history the
   * page can show, and a date alone would leave a manager unable to tell two
   * moves made the same afternoon apart.
   */
  protected statusChanged(order: AdminOrderDetail): string {
    return this.dateTimeFormat.format(new Date(order.statusChangedAt));
  }

  protected statusLabel(order: AdminOrderDetail): string {
    return orderStatusLabel(
      order.status,
      order.fulfilmentMethod,
      this.listText,
    );
  }

  protected statusTone(order: AdminOrderDetail): StatusTone {
    return orderStatusTone(order.status, 'staff', order.fulfilmentMethod);
  }

  protected paymentLabel(order: AdminOrderDetail): string {
    const payment = this.text.paymentState;
    if (order.paymentState === 'awaiting') return payment.awaiting;
    if (order.paymentState !== 'paid') return payment.notDue;
    return fillText(payment.paid, {
      date: order.paidAt
        ? this.dateTimeFormat.format(new Date(order.paidAt))
        : '',
    });
  }

  /** A move is in flight, or one just failed. Both are about this page rather
   * than about the order, so neither lives on the resource. */
  protected readonly busy = signal(false);
  protected readonly failed = signal<string | null>(null);

  /**
   * The moves this page offers: the transition table's answer for staff,
   * narrowed to what has an endpoint today (an adjustment carries a new
   * snapshot and is its own operation) and to what has a better word already
   * — an unanswered order is declined, not cancelled.
   */
  protected readonly moves = computed(() => {
    const order = this.detail();
    if (!order) return [];
    return allowedTransitions('staff', order.status)
      .filter((to): to is TransitionTarget =>
        (DIRECT_TRANSITION_TARGETS as readonly string[]).includes(to),
      )
      .filter((to) => !(to === 'cancelled' && order.status === 'requested'))
      .map((to) => ({
        to,
        label: this.moveLabel(to, order),
        // Undoing an ending is a correction, not the next step in the order's
        // life: it should not look like the button a manager is meant to
        // press next.
        variant: transitionHasReason(to)
          ? ('dangerOutline' as const)
          : to === 'requested'
            ? ('secondary' as const)
            : ('primary' as const),
        run: () => this.move(order, to),
      }));
  });

  private moveLabel(to: TransitionTarget, order: AdminOrderDetail): string {
    const actions = this.text.actions;
    return {
      requested: actions.reopen,
      approved: actions.approve,
      // The same lens the badge reads the state through: what the manager is
      // about to do is put it on the shelf or send it out.
      ready:
        order.fulfilmentMethod === 'pickup'
          ? actions.readyPickup
          : actions.ready,
      completed: actions.complete,
      declined: actions.decline,
      cancelled: actions.cancel,
    }[to];
  }

  /**
   * Every move is confirmed, and the two that end an order ask why — the
   * customer's mail quotes it. A refusal means somebody else answered the
   * order first, so the page reloads rather than argues.
   */
  private async move(
    order: AdminOrderDetail,
    to: TransitionTarget,
  ): Promise<void> {
    const actions = this.text.actions;
    const label = this.moveLabel(to, order);
    const heading = fillText(actions.confirmHeading, { action: label });
    const reason = transitionHasReason(to)
      ? await this.confirm.askWithReason({
          heading,
          message: actions.confirmMessage,
          confirmLabel: label,
          cancelLabel: actions.keep,
          reasonLabel: actions.reasonLabel,
          reasonMaxLength: ORDER_STATUS_REASON_MAX,
        })
      : (await this.confirm.ask({
            heading,
            message: actions.confirmMessage,
            confirmLabel: label,
            cancelLabel: actions.keep,
            confirmVariant: 'primary',
          }))
        ? ''
        : null;
    if (reason === null) return;

    await this.run(
      () => this.api.transition(order.reference, to, reason || null),
      actions.error,
    );
  }

  /**
   * The one move the payment row offers: record it, or take that record back.
   *
   * Both are the same observation — a manager saying whether the money is
   * here — and the undo exists for the same reason reopening does: a box
   * ticked on the wrong order must not stand for good. It is not a refund;
   * that happens in the shop's books.
   *
   * Neither is offered on an order that ended without being filled: nothing
   * is owed on it and nothing arrives for it.
   */
  protected readonly paymentMove = computed(() => {
    const order = this.detail();
    if (!order) return null;
    const ended = order.status === 'declined' || order.status === 'cancelled';
    if (ended) return null;
    const payment = this.text.paymentState;
    const paid = order.paymentState === 'paid';
    return {
      label: paid ? payment.clear : payment.record,
      run: () => this.setPayment(order, !paid),
    };
  });

  private async setPayment(
    order: AdminOrderDetail,
    paid: boolean,
  ): Promise<void> {
    const payment = this.text.paymentState;
    const confirmed = await this.confirm.ask({
      heading: paid ? payment.confirmHeading : payment.clearConfirmHeading,
      message: paid ? payment.confirmMessage : payment.clearConfirmMessage,
      confirmLabel: paid ? payment.confirm : payment.clearConfirm,
      cancelLabel: payment.keep,
      confirmVariant: 'primary',
    });
    if (!confirmed) return;

    await this.run(
      () => this.api.setPayment(order.reference, paid),
      payment.error,
    );
  }

  /** One shape for both: run it, say so where the server refused, and leave
   * the page showing what the order actually is now. */
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
      this.order.reload();
    }
  }

  private readonly dateFormat = new Intl.DateTimeFormat(this.currency.locale, {
    dateStyle: 'long',
  });

  /** For the two facts a manager reads as moments rather than as days: when
   * the order last moved, and when the payment was recorded. */
  private readonly dateTimeFormat = new Intl.DateTimeFormat(
    this.currency.locale,
    { dateStyle: 'long', timeStyle: 'short' },
  );

  constructor() {
    usePageSeo({ name: () => this.reference() });
  }
}
