import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Link } from '../../ui/link';
import {
  AdminOrderDetail,
  AdminOrderLine,
  allowedTransitions,
  fillText,
  moveDirection,
  nextPaymentState,
  notifyByDefault,
  ORDER_STATUS_REASON_MAX,
  OrderStatus,
  transitionHasReason,
  TransitionTarget,
} from '@b2b-catalog-platform/shared';
import { OrderSummary } from '../../cart/order-summary';
import { formatPriceMinor } from '../../catalog/price';
import { ADMIN_TEXT } from '../../config/admin-text';
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
import { orderDateTimeFormat } from '../../orders/order-view';
import { Button } from '../../ui/button';
import { ConfirmCheck } from '../../ui/confirm-dialog';
import { ConfirmService } from '../../ui/confirm.service';
import {
  DISCLOSURE_FRAME,
  disclosureBorder,
  DisclosureToggle,
} from '../../ui/disclosure-toggle';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Skeleton } from '../../ui/skeleton';
import { StatusBadge, StatusTone } from '../../ui/status-badge';
import { OrderAdjustChanges, OrderChange } from './order-adjust-changes';
import { OrderDocumentsPanel } from './order-documents-panel';
import { orderChanges } from './order-changes';
import { AdminOrdersService } from './orders.service';
import { revisionKindLabel } from './revision-labels';

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

/** One piece of the sentence that says how far behind the customer is: a run
 * of the deployment's own words, or a version it names. */
interface BehindPart {
  text: string;
  version: number | null;
}

/** The three choices a move offers, keyed so the answer can be read back. */
const SHOW_CUSTOMER = 'showCustomer';
const NOTIFY = 'notify';
const MARK_PAID = 'markPaid';

@Component({
  selector: 'app-admin-order-detail-page',
  imports: [
    RouterLink,
    AdminIcon,
    Button,
    Link,
    DisclosureToggle,
    OrderAdjustChanges,
    OrderDocumentsPanel,
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

              Each control stands on the row of the fact it changes, directly
              under it — the payment under what is owed, the moves and the
              adjustment under the status, telling the customer under what they
              are looking at. Nothing has to line up across the block for that
              to read: a button is next to its own sentence.
            -->
            <section class="mt-6 rounded-lg border border-border p-5 text-sm">
              <dl class="grid gap-x-6 break-words sm:grid-cols-[7rem_1fr]">
                <dt [class]="term">{{ text.customer }}</dt>
                <dd [class]="value">
                  {{ order.customerEmail ?? listText.guest }}
                  <!-- A guest reads this order through the link they were
                       mailed and through nothing else, so when they ring to
                       say the page shows something different, this is the
                       page they mean. An account holder needs no such link:
                       the version they are on is already one, further down. -->
                  @if (order.publicToken; as token) {
                    <a
                      appLink
                      class="ml-2"
                      [routerLink]="['/orders', token]"
                      target="_blank"
                      >{{ text.guestView }}</a
                    >
                  }
                </dd>
                <dt [class]="term">{{ text.tier }}</dt>
                <dd [class]="value">{{ order.tierKey ?? text.tierDefault }}</dd>

                <!-- Money before the workflow, and deliberately: recording a
                     payment moves nothing along, and the customer sees it the
                     moment it is recorded. Read under the status it used to
                     sit below, it looked like the next step of one thing. -->
                <dt [class]="term">{{ text.paymentState.heading }}</dt>
                <dd [class]="row">
                  <p class="min-w-0">
                    {{ paymentLabel(order) }}
                  </p>
                  @if (paymentMove(); as move) {
                    <div [class]="actions">
                      <button
                        appButton
                        size="sm"
                        variant="secondary"
                        type="button"
                        class="w-full gap-2 sm:w-auto"
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
                  <div class="min-w-0">
                    <!-- When it last moved reads as part of where it
                         stands, so it sits beside the badge and wraps under
                         it only when there is no room. -->
                    <div class="flex flex-wrap items-center gap-x-2">
                      <span appStatusBadge [tone]="statusTone(order)">
                        {{ statusLabel(order) }}
                      </span>
                      <span class="text-subtle">{{
                        statusChanged(order)
                      }}</span>
                    </div>
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
                      class="w-full gap-2 sm:w-auto"
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
                        class="w-full gap-2 sm:w-auto"
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

                <!-- What the customer can see, and what they have been told.
                     Always shown, and two questions rather than one: a version
                     reaches their page whether or not a message goes with it,
                     and either half can be left undone by a manager clearing a
                     tick. A screen that only drew itself when something was
                     wrong was one with no way back from that. -->
                <dt [class]="term">{{ tellText.heading }}</dt>
                <dd [class]="row">
                  <div class="min-w-0">
                    <!-- Each version the sentence names links at that version,
                         and carries the weight the rest of the line does not:
                         which versions these are is the whole content of it.
                         Written as one line, because a newline between the
                         parts is a space Angular would put back — in front of
                         the semicolon. -->
                    <!-- prettier-ignore -->
                    <p>@for (part of behind(); track $index) {@if (part.version) {<a
                      class="font-medium hover:text-accent"
                      [routerLink]="['/admin/orders', order.reference, 'revisions', part.version]"
                      [title]="revisionText.openRevision"
                    >{{ part.text }}</a>} @else {{{ part.text }}}}</p>
                    <p class="text-subtle">{{ emailed() }}</p>
                  </div>
                  @if (customerAction(); as action) {
                    <div [class]="actions">
                      <button
                        appButton
                        size="sm"
                        variant="secondary"
                        type="button"
                        class="w-full gap-2 sm:w-auto"
                        [disabled]="busy()"
                        (click)="tellCustomer(order, action.kind)"
                      >
                        <app-admin-icon [name]="action.icon" class="h-4 w-4" />
                        {{ action.label }}
                      </button>
                    </div>
                  }
                </dd>

                <!-- What the order carries (FR-ORD-05): the summary the shop
                     system draws, and the payment details only the shop can
                     give. Here rather than beside the order, because supplying
                     one is something a manager does while answering it. -->
                <dt [class]="term">{{ documentsText.heading }}</dt>
                <dd [class]="value">
                  <app-order-documents-panel
                    [order]="order"
                    (changed)="reload()"
                  />
                </dd>

                <!-- Every version of the order, newest first (FR-ORD-03) — what
                   the shop said it changed, and the difference from the version
                   before it. Inside this block rather than beside it: the
                   history is the rest of what only staff see, and the order
                   itself reads at the width it always did. Only where there is
                   more than one version: an order nobody has adjusted has no
                   history to read. -->
                @if (order.revisionNumber > 1) {
                  <dt [class]="term">{{ revisionText.heading }}</dt>
                  <dd [class]="value">
                    <div
                      class="rounded-md border"
                      [class]="frame + ' ' + disclosureBorder(historyOpen())"
                    >
                      <app-disclosure-toggle
                        [label]="revisionText.subheading"
                        [count]="order.revisionNumber"
                        [countLabel]="revisionCount(order)"
                        [open]="historyOpen()"
                        [panelId]="historyPanelId"
                        (toggled)="historyOpen.set(!historyOpen())"
                      />
                      @if (historyOpen()) {
                        <!-- The rule that divides the panel from its lid belongs to
                         what is under it, not to the panel: the versions are
                         fetched when the fold opens, and a bordered box with
                         nothing in it yet drew a stray line across the rounded
                         bottom of the frame for as long as the request took.
                         The bars stand in for them meanwhile, so the panel
                         opens to its content rather than to a hairline. -->
                        <div [id]="historyPanelId">
                          @if (history().length) {
                            <!-- Ruled rather than spaced: a thread of six versions
                             each carrying a note, a state and a fold reads as
                             one block of text without a line between them. -->
                            <ol
                              class="divide-y divide-border border-t border-border"
                            >
                              @for (entry of history(); track entry.number) {
                                <li class="p-4">
                                  <div
                                    class="flex flex-wrap items-center gap-x-2 gap-y-1"
                                  >
                                    <!-- What the version was for and where the
                                     order stood, first: it is the sentence the
                                     note below explains, and the note read as
                                     its caption when the two were the other way
                                     round. -->
                                    <a
                                      class="font-medium hover:text-accent"
                                      [routerLink]="[
                                        '/admin/orders',
                                        order.reference,
                                        'revisions',
                                        entry.number,
                                      ]"
                                      [title]="revisionText.openRevision"
                                    >
                                      {{ entry.label }}
                                    </a>
                                    <!-- The order's own states in the order's own
                                     colours: a version says where the order
                                     stood when it was written, and a manager
                                     reading the thread should not have to learn
                                     a second vocabulary for it. -->
                                    <span appStatusBadge [tone]="entry.tone">
                                      {{ entry.status }}
                                    </span>
                                    <span class="text-subtle">
                                      {{ entry.kindLabel }}
                                    </span>
                                  </div>
                                  <p class="mt-1 text-subtle">
                                    {{ entry.writtenBy }}
                                  </p>

                                  <!-- The two facts about the customer, in the
                                   quiet variant: neither is a state of the
                                   order, and drawn as solid pills beside the
                                   status they read as three states of one
                                   thing. -->
                                  @if (entry.customerView || entry.notified) {
                                    <p
                                      class="mt-1 flex flex-wrap items-center gap-2"
                                    >
                                      @if (entry.customerView) {
                                        <span
                                          appStatusBadge
                                          variant="dot"
                                          tone="info"
                                        >
                                          {{ revisionText.customerView }}
                                        </span>
                                      }
                                      @if (entry.notified; as notified) {
                                        <span
                                          appStatusBadge
                                          variant="dot"
                                          tone="ok"
                                        >
                                          {{ notified }}
                                        </span>
                                      }
                                    </p>
                                  }

                                  @if (entry.note) {
                                    <p class="mt-1">
                                      <span class="text-subtle">
                                        {{ revisionText.note }}:
                                      </span>
                                      {{ entry.note }}
                                    </p>
                                  }

                                  <!-- The differences fold. They are the long half
                                   of an entry and the half nobody reads twice,
                                   and the comparison behind them is only run
                                   for the ones actually opened — a thread of
                                   twenty versions is twenty diffs of a whole
                                   order otherwise. -->
                                  @if (entry.kind === 'adjustment') {
                                    <div class="mt-2">
                                      <app-disclosure-toggle
                                        class="-mx-4 block"
                                        [label]="revisionText.changes"
                                        [open]="diffOpen().has(entry.number)"
                                        [panelId]="diffPanelId(entry.number)"
                                        (toggled)="toggleDiff(entry.number)"
                                      />
                                      @if (diffOpen().has(entry.number)) {
                                        <app-order-adjust-changes
                                          [id]="diffPanelId(entry.number)"
                                          [empty]="revisionText.noChanges"
                                          [changes]="diff(entry.number)"
                                        />
                                      }
                                    </div>
                                  }
                                </li>
                              }
                            </ol>
                          } @else if (revisions.error()) {
                            <p
                              class="border-t border-border p-4 text-muted"
                              role="alert"
                            >
                              {{ revisionText.loadError }}
                            </p>
                          } @else {
                            <div class="border-t border-border p-4">
                              <app-skeleton [lines]="3" />
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </dd>
                }
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
  protected readonly documentsText = this.text.documents;
  protected readonly tellText = this.text.tellCustomer;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly frame = DISCLOSURE_FRAME;
  protected readonly disclosureBorder = disclosureBorder;
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
   * A fact and the control that changes it: the control under the fact it
   * changes, rather than off to one side of it. Read down, each row is a
   * thing the order says followed by what can be done about it.
   */
  protected readonly row = this.value + ' flex flex-col gap-3';
  /**
   * The controls of one row. They are as wide as their words from `sm` up,
   * and wrap onto a second line when there are more of them than fit; below
   * that they are a stack of full-width buttons, which is the only shape a
   * button reads well in on a phone. The space under them is their own: a
   * button group needs more air before the next fact than one line of text
   * does.
   */
  protected readonly actions =
    'mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap';
  protected readonly historyPanelId = 'order-versions';
  protected readonly historyOpen = signal(false);

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
   * Every version of this order, fetched only once the panel is opened: an
   * order nobody has adjusted has one version, and a manager reading the
   * current one is not asking about the others.
   */
  protected readonly revisions = resource({
    params: () => (this.historyOpen() ? this.reference() : undefined),
    loader: ({ params }) => this.api.revisions(params),
  });

  /**
   * The history as it reads: each version, what the shop said about it, and
   * what it changed from the one before — the same comparison the adjustment
   * screen shows before anything is written, so what a manager approved is
   * what the order says afterwards.
   */
  protected readonly history = computed(() => {
    if (!this.revisions.hasValue()) return [];
    const versions = this.revisions.value() ?? [];
    return versions.map((version) => ({
      number: version.revisionNumber,
      note: version.note,
      // What the version was written for, where the order stood when it was,
      // and whether it is the one the customer is looking at — the three
      // things a thread of versions has to say that a diff cannot.
      kind: version.kind,
      kindLabel: revisionKindLabel(version.kind, this.revisionText),
      status: orderStatusLabel(
        version.status,
        version.fulfilmentMethod,
        this.listText,
      ),
      tone: orderStatusTone(version.status, 'staff', version.fulfilmentMethod),
      customerView: version.customerView,
      // Null on a version nobody was written to about, which is most of them:
      // the shop tells the customer when there is news, not per version.
      notified: version.notifiedAt
        ? fillText(this.revisionText.notified, {
            date: this.dateTimeFormat.format(new Date(version.notifiedAt)),
          })
        : null,
      label: fillText(this.revisionText.versionLabel, {
        number: version.revisionNumber,
      }),
      writtenBy: fillText(this.revisionText.writtenBy, {
        date: this.dateTimeFormat.format(new Date(version.revisionCreatedAt)),
        who:
          version.author ??
          (version.revisionNumber === 1
            ? this.revisionText.authorCustomer
            : this.revisionText.authorUnknown),
      }),
    }));
  });

  /** Which versions have their differences unfolded. */
  protected readonly diffOpen = signal(new Set<number>());

  protected diffPanelId(number: number): string {
    return `${this.historyPanelId}-diff-${number}`;
  }

  protected toggleDiff(number: number): void {
    this.diffOpen.update((open) => {
      const next = new Set(open);
      if (!next.delete(number)) next.add(number);
      return next;
    });
  }

  /**
   * What one version changed from the one before it — worked out when it is
   * asked for rather than for the whole thread at once.
   *
   * Every entry is a whole order compared against a whole order, and a thread
   * grows for as long as an order is worked on: doing all of them to render a
   * list nobody has opened is the difference between a panel that appears and
   * a panel that arrives.
   */
  protected diff(number: number): OrderChange[] {
    const versions = this.revisions.hasValue()
      ? (this.revisions.value() ?? [])
      : [];
    const index = versions.findIndex(
      (version) => version.revisionNumber === number,
    );
    // The list is newest first, so the version this one superseded is the next
    // entry along. Nothing before the first: it changed nothing, it began.
    const before = index >= 0 ? versions[index + 1] : undefined;
    if (!before) return [];
    return orderChanges(
      before,
      versions[index],
      this.revisionText,
      this.text,
      {
        address: this.config.address,
        phoneInput: this.config.phoneInput,
        locale: this.currency.locale,
      },
      this.currency,
    );
  }

  /**
   * Which version the customer was last written to about and which one the
   * order is on, as the pieces of one sentence: the deployment's wording, cut
   * at its placeholders so each version it names can be a link to that version.
   *
   * Cut rather than composed, because the punctuation between the halves is
   * the deployment's — a language that ends the clause differently, or writes
   * the versions the other way round, still gets its own sentence.
   */
  protected readonly behind = computed((): BehindPart[] => {
    const order = this.detail();
    if (!order) return [];
    const numbers: Record<string, number> = {
      '{seen}': order.customerRevisionNumber,
      '{current}': order.revisionNumber,
    };
    // Level with the order, or behind it: the same sentence either way, so a
    // manager reads one line and not two shapes of it.
    const template =
      order.customerRevisionNumber < order.revisionNumber
        ? this.tellText.behind
        : this.tellText.on;
    return template
      .split(/(\{seen\}|\{current\})/)
      .filter((piece) => piece !== '')
      .map((piece) =>
        piece in numbers
          ? {
              text: fillText(this.revisionText.versionInline, {
                number: numbers[piece],
              }),
              version: numbers[piece],
            }
          : { text: piece, version: null },
      );
  });

  /** The second line: whether anything has ever been said, and about what. */
  protected readonly emailed = computed(() => {
    const order = this.detail();
    if (!order) return '';
    return order.notifiedRevisionNumber
      ? fillText(this.tellText.emailedOn, {
          notified: fillText(this.revisionText.versionInline, {
            number: order.notifiedRevisionNumber,
          }),
        })
      : this.tellText.emailedNever;
  });

  /**
   * What is left to do about the customer, in the order it has to be done.
   *
   * Moving their page on comes first, because a message about a version they
   * are not being shown would link them to something else. Once they are
   * level, the only thing left is the message — offered whether or not one has
   * gone already, since a mail that landed in a spam folder is one somebody
   * has to be able to send again, and re-sending the version they hold says
   * exactly what their page says.
   */
  protected readonly customerAction = computed(() => {
    const order = this.detail();
    if (!order) return null;
    if (order.customerRevisionNumber < order.revisionNumber) {
      return {
        kind: 'update' as const,
        label: this.tellText.update,
        icon: 'arrow-right' as const,
      };
    }
    return {
      kind: 'email' as const,
      label:
        order.notifiedRevisionNumber < order.customerRevisionNumber
          ? this.tellText.email
          : this.tellText.emailAgain,
      icon: 'send' as const,
    };
  });

  protected revisionCount(order: AdminOrderDetail): string {
    return fillText(this.common.countSuffix, { count: order.revisionNumber });
  }

  /**
   * Move the customer's page on, or write to them about the version they
   * already hold. One endpoint, because they are one decision made in two
   * halves: the update offers the message as a tick, and the message on its
   * own is that tick with nothing to move.
   */
  protected async tellCustomer(
    order: AdminOrderDetail,
    kind: 'update' | 'email',
  ): Promise<void> {
    const tell = this.tellText;
    const asked =
      kind === 'update'
        ? {
            heading: tell.updateConfirmHeading,
            message: tell.updateConfirmMessage,
            confirmLabel: tell.updateConfirm,
            checks: [
              {
                key: NOTIFY,
                label: tell.updateNotify,
                hint: tell.updateNotifyHint,
                // Ticked: a version they have not been shown is news, and the
                // manager who did not want to send one can clear it and come
                // back to the button that stays behind.
                checked: true,
              },
            ],
          }
        : {
            heading: tell.emailConfirmHeading,
            message: tell.emailConfirmMessage,
            confirmLabel: tell.emailConfirm,
            checks: [],
          };

    const answer = await this.confirm.askDetailed({
      ...asked,
      cancelLabel: tell.keep,
      confirmVariant: 'primary',
    });
    if (!answer) return;

    await this.run(
      () =>
        this.api.notifyCustomer(
          order.reference,
          kind === 'email' || (answer.checks[NOTIFY] ?? false),
        ),
      tell.error,
    );
  }

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
   * What the confirmation offers besides yes and no: whether the move reaches
   * the customer's own page, whether they are written to about it, and — on
   * the move that is a handover — whether the money came with the goods.
   *
   * All three are offered with an answer already in them, because all three
   * are almost always the same answer and none is one a manager should have to
   * think about twice a day. None is inferred and then done silently: the mail
   * cannot be taken back, and a payment recorded by a side effect is one
   * nobody remembers making.
   *
   * The first is ticked as a matter of course — a move is where the order is,
   * and the person waiting for it should read the truth. Clearing it is for
   * the step that should never have been taken: `ready` on the wrong order,
   * put straight back.
   */
  private moveChecks(
    order: AdminOrderDetail,
    to: TransitionTarget,
  ): ConfirmCheck[] {
    const actions = this.text.actions;
    const checks: ConfirmCheck[] = [
      {
        key: SHOW_CUSTOMER,
        label: actions.showCustomer,
        hint: actions.showCustomerHint,
        checked: true,
      },
      {
        key: NOTIFY,
        label: actions.notify,
        // Said here rather than left to be discovered: the shop's payment
        // instructions travel with a message sent while the money is owed
        // (FR-ORD-05), and a manager choosing to write should know the
        // customer gets the slip with it.
        hint: this.paymentNote(order, to)
          ? `${actions.notifyHint} ${this.paymentNote(order, to)}`
          : actions.notifyHint,
        checked: notifyByDefault(order.status, to, order.notifiedStatuses),
        requires: SHOW_CUSTOMER,
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
   * Whether the payment instructions on this order will ride along with the
   * message this move sends.
   *
   * What to say about payment in the dialog that offers to write to them.
   *
   * Asked of the shared table rather than restated: the server attaches the
   * slip to a message sent while the money is owed, and where the order will
   * *stand* after a move is exactly what `nextPaymentState` answers.
   * `approved` on an invoiced order is the case this exists for — the one
   * message that both accepts the order and says how to pay for it.
   */
  private paymentNote(
    order: AdminOrderDetail,
    to: TransitionTarget,
  ): string | null {
    const owing =
      nextPaymentState(order.paymentState, order.paymentMethod, to) ===
      'awaiting';
    if (!owing) return null;
    const supplied = order.documents.some(
      (document) =>
        document.kind === 'payment-instructions' &&
        document.source === 'supplied',
    );
    // Either the slip goes with the message, or there is no slip and this is
    // the last comfortable moment to notice: the customer is about to be told
    // they owe money.
    return supplied
      ? this.text.actions.notifyAttachment
      : this.text.actions.notifyNoDocument;
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
      // Ending an order the shop has been paid for. The move is allowed — the
      // platform records what the shop did — but nothing here sends the money
      // back (FR-ORD-04), and this is the moment somebody would assume it
      // does. The customer's own cancel button carries the same sentence.
      warning:
        order.paymentState === 'paid' && transitionHasReason(to)
          ? actions.paidWarning
          : undefined,
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
          showCustomer: answer.checks[SHOW_CUSTOMER] ?? true,
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
      // The thread is a second resource, and a move writes a version: an open
      // history panel that kept its old list would be describing the order as
      // it was a click ago. Idle while the panel is shut, and reloading an
      // idle resource fetches nothing.
      this.revisions.reload();
    }
  }

  /**
   * Re-read the order after a document was supplied or taken back. Only the
   * order: a document writes no version (ADR 0052), so the thread is unchanged
   * and reloading it would fetch the same list again.
   */
  protected reload(): void {
    this.order.reload();
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
