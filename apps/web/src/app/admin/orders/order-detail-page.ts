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
  fillText,
  moveDirection,
  notifyByDefault,
  OrderStatus,
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
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Skeleton } from '../../ui/skeleton';
import { orderBlocks } from '../../orders/order-blocks';
import { orderDateTimeFormat } from '../../orders/order-view';
import {
  OrderReadBack,
  ReadBackLine,
  ReviewBlock,
} from '../../orders/order-read-back';
import { StatusBadge, StatusTone } from '../../ui/status-badge';
import { orderStatusLabel, orderStatusTone } from '../../orders/order-status';
import { ConfirmCheck } from '../../ui/confirm-dialog';
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
/**
 * Whether this move runs against the chain — staff's undo rather than the next
 * step. It decides what the button is called and how loudly it is drawn, and
 * it is the same question the mail and the notify tick ask, so all three read
 * one answer.
 */
function backwards(from: OrderStatus, to: TransitionTarget): boolean {
  return moveDirection(from, to) === 'backward';
}


/** The two choices a move offers, keyed so the answer can be read back. */
const NOTIFY = 'notify';
const MARK_PAID = 'markPaid';

@Component({
  selector: 'app-admin-order-detail-page',
  imports: [
    RouterLink,
    AdminIcon,
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
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 class="text-3xl font-medium tracking-tight">
                {{ order.reference }}
              </h1>
            </div>
            <p class="mt-2 text-muted">{{ placed(order) }}</p>

            <!--
              What only staff see, and what only staff do, in one block: whose
              the order is, what it was priced from, what it owes, where it
              stands, and every version it has had.

              Each control stands on the row of the fact it changes — the
              payment beside what is owed, the moves and the adjustment beside
              the status, telling the customer beside what they are looking at.
              They share one width and one right-hand edge, so the block still
              reads as a column of answers to the order rather than as buttons
              scattered through it.
            -->
            <section class="mt-6 rounded-lg border border-border p-5 text-sm">
              <dl class="grid gap-x-8 break-words sm:grid-cols-[7rem_1fr]">
                <dt [class]="term">{{ text.customer }}</dt>
                <dd [class]="value">
                  {{ order.customerEmail ?? listText.guest }}
                </dd>
                <dt [class]="term">{{ text.tier }}</dt>
                <dd [class]="value">{{ order.tierKey ?? text.tierDefault }}</dd>

                <!-- Money before the workflow, and deliberately: recording a
                     payment moves nothing along, and the customer sees it the
                     moment it is recorded. Read under the status it used to
                     sit below, it looked like the next step of one thing. -->
                <dt [class]="termCentred">{{ text.paymentState.heading }}</dt>
                <dd [class]="row" class="md:items-center">
                  <p class="min-w-0 flex-1">
                    {{ paymentLabel(order) }}
                  </p>
                  @if (paymentMove(); as move) {
                    <div [class]="actions">
                      <button
                        appButton
                        size="sm"
                        variant="secondary"
                        type="button"
                        class="w-full gap-2"
                        [disabled]="busy()"
                        (click)="move.run()"
                      >
                        <app-admin-icon [name]="move.icon" class="h-4 w-4" />
                        {{ move.label }}
                      </button>
                    </div>
                  }
                </dd>

                <dt [class]="term">{{ listText.status }}</dt>
                <dd [class]="row">
                  <div class="min-w-0 flex-1">
                    <span appStatusBadge [tone]="statusTone(order)">
                      {{ statusLabel(order) }}
                    </span>
                    <p class="mt-1 text-subtle">{{ statusChanged(order) }}</p>
                    <!-- Why it ended, on the line that says it ended: the
                         reason is part of the status and not a fact of its
                         own. -->
                    @if (order.statusReason; as reason) {
                      <p class="mt-1">
                        <span class="text-subtle"
                          >{{ text.statusReason }}:</span
                        >
                        {{ reason }}
                      </p>
                    }
                    <!-- And what the shop changed about the version on screen,
                         which is the other half of why the order reads as it
                         does. The versions below are the history; this is the
                         current one, where a manager is already looking. -->
                    @if (order.changes.length) {
                      <div class="mt-1 ">
                        <span class="text-subtle"
                          >{{ revisionText.note }}:</span
                        >
                        @for (change of order.changes; track $index) {
                          <span class="block">{{ change }}</span>
                        }
                      </div>
                    }
                  </div>

                  <div [class]="actions">
                    <!-- Changing what an order says stands with the moves
                         because it is the other half of answering one, and it
                         is offered wherever the order stands: a shortage found
                         while packing, an address corrected on a van, a
                         completed order somebody recorded wrongly. A link, not
                         a button: it opens a form, and nothing happens until
                         that form is saved. -->
                    <a
                      appButton
                      size="sm"
                      variant="secondary"
                      class="w-full gap-2"
                      [routerLink]="[
                        '/admin/orders',
                        order.reference,
                        'adjust',
                      ]"
                    >
                      <app-admin-icon name="pencil" class="h-4 w-4" />
                      {{ text.actions.adjust }}
                    </a>

                    <!-- The glyph says which way the move runs: on down the
                         chain, back up it, or off it altogether. Not a bin for
                         the last of those — orders are never deleted (ADR
                         0050), and a bin standing for "decline" would one day
                         be pressed by somebody meaning to tidy a list. -->
                    @for (move of moves(); track move.to) {
                      <button
                        appButton
                        size="sm"
                        type="button"
                        class="w-full gap-2"
                        [variant]="move.variant"
                        [disabled]="busy()"
                        (click)="move.run()"
                      >
                        <app-admin-icon [name]="move.icon" class="h-4 w-4" />
                        {{ move.label }}
                      </button>
                    }
                  </div>
                </dd>

                <!-- What the customer has been told, which is only worth a
                     line when it is not where the order stands. Every move
                     offers to write to them and most are taken up on it, so
                     this row is what is left: a change nobody announced, and
                     the moves somebody deliberately kept quiet. -->
              </dl>
            </section>

            @if (failed(); as message) {
              <p class="mt-3 max-w-xl text-red-600" role="alert">
                {{ message }}
              </p>
            }

            <!-- The order as it now reads, at the width an order is read at.
                 Below the block above rather than beside it: a manager answers
                 the order first and checks it second. -->
            <app-order-read-back
              class="mt-8 max-w-xl"
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
  protected readonly revisionText = this.text.revisions;
  /**
   * The block's rows, spelled the way the account page spells its own: no row
   * gap, but a margin under each half, so on a narrow screen a label sits
   * close to its own value and the space falls between the rows rather than
   * splitting them.
   */
  protected readonly term =
    'text-subtle odd:mb-1 sm:odd:mb-3 nth-last-[2]:mb-0';
  protected readonly value = 'min-w-0 even:mb-3 last:mb-0';
  /**
   * A fact and the control that changes it, on one row: the fact reads at
   * whatever width is left, the control keeps its own.
   *
   * They stack at `md` rather than at `sm`. Two of these controls are a whole
   * sentence wide, and at tablet width they left the fact beside them a third
   * of a row to say itself in.
   */
  protected readonly row =
    this.value + ' flex flex-col gap-2 md:flex-row md:justify-between md:gap-4';
  /** One width for every control in the block, so they share a right edge
   * however long the facts beside them run. */
  protected readonly actions = 'flex w-full shrink-0 flex-col gap-3 md:w-3xs';
  /**
   * A label on a row whose control is a single button: it centres on that
   * button rather than sitting above it, which is what makes the three
   * one-control rows read as a column of controls.
   *
   * Not on the status row, whose left half is four lines of its own.
   */
  protected readonly termCentred =
    this.term + ' flex flex-wrap md:items-center';

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
      .filter((to) => !(to === 'cancelled' && order.status === 'requested'))
      .map((to) => ({
        to,
        label: this.moveLabel(to, order),
        // Which way it runs, said in a glyph: on down the chain, back up it,
        // or off it. The two ways an order ends share the mark the list's own
        // row action uses for them.
        icon: transitionHasReason(to)
          ? ('circle-slash' as const)
          : backwards(order.status, to)
            ? ('arrow-left' as const)
            : ('arrow-right' as const),
        // Walking an order back is a correction, not the next step in its
        // life: it should not look like the button a manager is meant to
        // press next.
        variant: transitionHasReason(to)
          ? ('dangerOutline' as const)
          : backwards(order.status, to)
            ? ('secondary' as const)
            : ('primary' as const),
        run: () => this.move(order, to),
      }));
  });

  /**
   * What a move is called, which depends on which way it runs.
   *
   * "Confirm" and "Back to confirmed" land on the same status and are not the
   * same act: one is the shop answering the order, the other is undoing a
   * click. A button that said "Confirm" on an order already out for delivery
   * would read as a step forward it is not.
   */
  private moveLabel(to: TransitionTarget, order: AdminOrderDetail): string {
    const actions = this.text.actions;
    if (backwards(order.status, to)) {
      return {
        requested: actions.backToRequested,
        approved: actions.backToApproved,
        ready: actions.backToReady,
      }[to as 'requested' | 'approved' | 'ready'];
    }
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
   * What the confirmation offers besides yes and no: whether the customer is
   * written to, and — on the move that is a handover — whether the money came
   * with the goods.
   *
   * Both are offered with an answer already in them, because both are almost
   * always the same answer and neither is one a manager should have to think
   * about twice a day. Neither is inferred and then done silently: the mail
   * cannot be taken back, and a payment recorded by a side effect is one
   * nobody remembers making.
   */
  private moveChecks(
    order: AdminOrderDetail,
    to: TransitionTarget,
  ): ConfirmCheck[] {
    const actions = this.text.actions;
    const checks: ConfirmCheck[] = [
      {
        key: NOTIFY,
        label: actions.notify,
        hint: actions.notifyHint,
        checked: notifyByDefault(order.status, to, order.notifiedStatuses),
      },
    ];
    // Only where there is money to record and a handover to record it with:
    // an order that ends here owes nothing, and one already marked paid has
    // nothing to add. Clearing a mis-tick stays the payment row's own job.
    if (order.paymentState !== 'paid' && !transitionHasReason(to)) {
      checks.push({
        key: MARK_PAID,
        label: actions.markPaid,
        hint: actions.markPaidHint,
        // Cash is paid at the handover — that is the whole reason the payment
        // axis is separate — so completing a cash order is the payment. Every
        // other method is invoiced and may well be outstanding for weeks.
        checked: to === 'completed' && order.paymentMethod === 'cash',
      });
    }
    return checks;
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
    const asked = {
      heading: fillText(actions.confirmHeading, { action: label }),
      message: actions.confirmMessage,
      confirmLabel: label,
      cancelLabel: actions.keep,
      checks: this.moveChecks(order, to),
    };
    const answer = await this.confirm.askDetailed(
      transitionHasReason(to)
        ? {
            ...asked,
            reasonLabel: actions.reasonLabel,
            reasonMaxLength: ORDER_STATUS_REASON_MAX,
          }
        : { ...asked, confirmVariant: 'primary' },
    );
    if (!answer) return;

    await this.run(
      () =>
        this.api.transition(order.reference, to, answer.reason || null, {
          notify: answer.checks[NOTIFY] ?? false,
          markPaid: answer.checks[MARK_PAID] ?? false,
        }),
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
      // Recording it is an observation; clearing it is an undo, and wears the
      // mark every undo in the admin wears.
      icon: paid ? ('rotate-ccw' as const) : ('circle-check' as const),
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
  private readonly dateTimeFormat = orderDateTimeFormat(this.currency.locale);

  constructor() {
    usePageSeo({ name: () => this.reference() });
  }
}
