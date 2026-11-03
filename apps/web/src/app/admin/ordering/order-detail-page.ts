import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { useTaxStatement } from '../../core/catalog/pricing/tax-statement';
import { RouterLink } from '@angular/router';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import {
  allowedTransitions,
  isOrderFinished,
  moveDirection,
  nextPaymentState,
  notifyByDefault,
  ORDER_STATUS_REASON_MAX,
  OrderStatus,
  transitionHasReason,
  AdminOrderDetail,
  AdminOrderLine,
} from '@b2b-catalog-platform/shared/core/ordering';
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
import { ConfirmCheck } from '@b2b-catalog-platform/ui/overlay/confirm-dialog';
import {
  ConfirmService,
  confirmRequest,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { AuthService } from '../../shared/auth/auth.service';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import { LockedNote } from '../ownership/locked-note';
import { OwnershipService } from '../settings/ownership.service';
import { OrderAdjustChanges, OrderChange } from './ui/order-adjust-changes';
import { OrderDocumentsPanel } from './order-documents-panel';
import { orderChanges } from './order-changes';
import { AdminOrdersService } from './orders.service';
import { revisionKindLabel } from './revision-labels';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { arrowLeftIcon } from '@b2b-catalog-platform/ui/icons/glyphs/arrow-left';
import { arrowRightIcon } from '@b2b-catalog-platform/ui/icons/glyphs/arrow-right';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { circleSlashIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-slash';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { rotateCcwIcon } from '@b2b-catalog-platform/ui/icons/glyphs/rotate-ccw';
import { sendIcon } from '@b2b-catalog-platform/ui/icons/glyphs/send';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { Card } from '@b2b-catalog-platform/ui/content/card';
import { FACT_LIST } from '@b2b-catalog-platform/ui/content/fact-list';

/** Whether a move runs back up the chain: staff's undo. The button's name and
 * weight, the mail and the notify tick all read this. */
function backwards(from: OrderStatus, to: OrderStatus): boolean {
  return moveDirection(from, to) === 'backward';
}

/** A run of the deployment's words, or a version it names. */
interface BehindPart {
  text: string;
  version: number | null;
}

/** A move's three choices, keyed to read the answer back. */
const SHOW_CUSTOMER = 'showCustomer';
const NOTIFY = 'notify';
const MARK_PAID = 'markPaid';

/**
 * One order as staff read it (FR-AUTH-03): the customer's page plus the price
 * list, the account and the lines in pieces (FR-UNIT-04). Also where it is
 * answered (FR-ORD-01/02/04); the moves come from the shared transition table
 * the API refuses by.
 */
@Component({
  selector: 'app-admin-order-detail-page',
  imports: [
    FACT_LIST,
    Card,
    RouterLink,
    Icon,
    Button,
    Link,
    DisclosureToggle,
    OrderAdjustChanges,
    OrderDocumentsPanel,
    Skeleton,
    OrderReadBack,
    OrderSummary,
    StatusBadge,
    LockedNote,
    PageTitle,
    ErrorText,
    DisclosureFrame,
  ],
  template: `
    @if (detail(); as order) {
      <!-- The customer's page notch, measured on the page, so both fold at one
           width. -->
      <div class="@container/order">
        <div
          class="grid gap-10
                 @min-[63.75rem]/order:grid-cols-[1fr_20rem]
                 @min-[63.75rem]/order:justify-between"
        >
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
                      @for (move of moves(); track move.to) {
                        <button
                          uiButton
                          size="sm"
                          type="button"
                          class="w-full gap-2 sm:w-auto"
                          [variant]="move.variant"
                          [disabled]="busy()"
                          (click)="move.run()"
                        >
                          <ui-icon [glyph]="move.icon" class="size-4" />
                          {{ move.label }}
                        </button>
                      }
                    </div>
                  }
                </dd>

                <!-- Their page and their mail, two questions, always shown:
                     either can be left undone. -->
                <dt uiFactTerm>{{ tellText.heading }}</dt>
                <dd uiFactValue class="flex flex-col gap-3">
                  <div class="min-w-0">
                    <!-- Each named version links to itself. One line: a newline
                         would put a space before the semicolon. -->
                    <!-- prettier-ignore -->
                    <p>@for (part of behind(); track $index) {@if (part.version) {<a
                      class="font-medium hover:text-accent"
                      [routerLink]="['/admin/orders', order.reference, 'revisions', part.version]"
                      [title]="revisionText.openRevision"
                    >{{ part.text }}</a>} @else {{{ part.text }}}}</p>
                    <p class="text-ink-subtle">{{ emailed() }}</p>
                  </div>
                  @if (customerAction(); as action) {
                    <div [class]="actions">
                      <button
                        uiButton
                        size="sm"
                        variant="secondary"
                        type="button"
                        class="w-full gap-2 sm:w-auto"
                        [disabled]="busy()"
                        (click)="tellCustomer(order, action.kind)"
                      >
                        <ui-icon [glyph]="action.icon" class="size-4" />
                        {{ action.label }}
                      </button>
                    </div>
                  }
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
                    <div
                      class="rounded-md border"
                      uiDisclosureFrame
                      [open]="historyOpen()"
                    >
                      <ui-disclosure-toggle
                        [label]="revisionText.subheading"
                        [count]="order.revisionNumber"
                        [countLabel]="revisionCount(order)"
                        [open]="historyOpen()"
                        [panelId]="historyPanelId"
                        (toggled)="historyOpen.set(!historyOpen())"
                      />
                      @if (historyOpen()) {
                        <!-- The rule belongs to the content: fetched on
                             opening, an empty box drew a stray line. Bars
                             meanwhile. -->
                        <div [id]="historyPanelId">
                          @if (history().length) {
                            <!-- Ruled: spaced versions run into one block. -->
                            <ol
                              class="divide-y divide-edge border-t border-edge"
                            >
                              @for (entry of history(); track entry.number) {
                                <li class="p-4">
                                  <div
                                    class="flex flex-wrap items-center gap-x-2
                                           gap-y-1"
                                  >
                                    <!-- Purpose and status first: the note
                                         below explains them. -->
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
                                    <!-- The order's own status colours. -->
                                    <span uiStatusBadge [tone]="entry.tone">
                                      {{ entry.status }}
                                    </span>
                                    <span class="text-ink-subtle">
                                      {{ entry.kindLabel }}
                                    </span>
                                  </div>
                                  <p class="mt-1 text-ink-subtle">
                                    {{ entry.writtenBy }}
                                  </p>

                                  <!-- Quiet: solid pills beside the status read
                                       as three states. -->
                                  @if (entry.customerView || entry.notified) {
                                    <p
                                      class="mt-1 flex flex-wrap items-center
                                             gap-2"
                                    >
                                      @if (entry.customerView) {
                                        <span
                                          uiStatusBadge
                                          variant="dot"
                                          tone="info"
                                        >
                                          {{ revisionText.customerView }}
                                        </span>
                                      }
                                      @if (entry.notified; as notified) {
                                        <span
                                          uiStatusBadge
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
                                      <span class="text-ink-subtle">
                                        {{ names.changeNote }}:
                                      </span>
                                      {{ entry.note }}
                                    </p>
                                  }

                                  <!-- Folded, and compared only when opened:
                                       twenty versions are twenty whole-order
                                       diffs. -->
                                  @if (entry.kind === 'adjustment') {
                                    <div class="mt-2">
                                      <ui-disclosure-toggle
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
                              class="border-t border-edge p-4 text-ink-subtle"
                              role="alert"
                            >
                              {{ revisionText.loadError }}
                            </p>
                          } @else {
                            <div class="border-t border-edge p-4">
                              <ui-skeleton [lines]="3" />
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

          <aside
            class="max-w-xl
                   @min-[63.75rem]/order:mt-9 @min-[63.75rem]/order:sticky
                   @min-[63.75rem]/order:top-20
                   @min-[63.75rem]/order:self-start"
          >
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
        </div>
      </div>
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
  private readonly currency = moneyFormat(this.config);

  protected readonly text = inject(ADMIN_TEXT).orders.detail;
  protected readonly ordersText = inject(ADMIN_TEXT).orders;
  private readonly changeText = inject(ADMIN_TEXT).orders.changes;
  protected readonly names = inject(SHARED_TEXT).order;
  protected readonly pageNames = inject(SHARED_TEXT).nav;
  private readonly sharedText = inject(SHARED_TEXT);
  protected readonly revisionText = this.text.revisions;
  protected readonly documentsText = this.text.documents;
  protected readonly tellText = this.text.tellCustomer;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  /** Whether an external system answers orders (FR-ADM-10); in flight counts as
   * not owned. Every control's computed returns nothing then: one rule, not a
   * condition per button. */
  protected readonly locked = computed(() => this.ownership.owns('orders'));
  /** As wide as their words from `sm`, wrapping; full-width stacked below.
   * Their own space beneath: a button group needs more air. */
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

  /** Through `hasValue`: an errored resource throws from `value()`. */
  protected readonly detail = computed(() =>
    this.order.hasValue() ? this.order.value() : null,
  );
  protected readonly missing = computed(
    () => this.order.hasValue() && this.order.value() === null,
  );

  /** In pieces, "100 × 0.42": the source system prices per piece. */
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
      staffBlockLabels(this.sharedText, this.ordersText, this.text),
      {
        address: this.config.address,
        phoneInput: this.config.phoneInput,
        locale: this.config.locale,
      },
    );
  });

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

  /** Fetched only once the panel opens. */
  protected readonly revisions = resource({
    params: () => (this.historyOpen() ? this.reference() : undefined),
    loader: ({ params }) => this.api.revisions(params),
  });

  /** Each version, its note and its difference: the adjustment screen's
   * comparison, so what was approved is what it says. */
  protected readonly history = computed(() => {
    if (!this.revisions.hasValue()) return [];
    const versions = this.revisions.value() ?? [];
    return versions.map((version) => ({
      number: version.revisionNumber,
      note: version.note,
      // Purpose, status at the time, and whether the customer sees it: what a
      // diff cannot say.
      kind: version.kind,
      kindLabel: revisionKindLabel(version.kind, this.revisionText),
      status: orderStatusLabel(
        version.status,
        version.fulfilmentMethod,
        this.ordersText.statuses,
      ),
      tone: orderStatusTone(version.status, 'staff', version.fulfilmentMethod),
      customerView: version.customerView,
      // Null for most: the customer hears about news, not versions.
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
          // A person, then the external system, then the unsigned: the
          // submission, or a deleted author.
          version.author ??
          version.source ??
          (version.revisionNumber === 1
            ? this.revisionText.authorCustomer
            : this.revisionText.authorUnknown),
      }),
    }));
  });

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

  /** Computed on request: a whole-order comparison per entry is too much for an
   * unopened list. */
  protected diff(number: number): OrderChange[] {
    const versions = this.revisions.hasValue()
      ? (this.revisions.value() ?? [])
      : [];
    const index = versions.findIndex(
      (version) => version.revisionNumber === number,
    );
    // Newest first, so the predecessor is next; the first began.
    const before = index >= 0 ? versions[index + 1] : undefined;
    if (!before) return [];
    return orderChanges(
      before,
      versions[index],
      { ...this.changeText, total: this.names.total },
      this.sharedText,
      staffBlockLabels(this.sharedText, this.ordersText, this.text),
      {
        address: this.config.address,
        phoneInput: this.config.phoneInput,
        locale: this.config.locale,
        currency: this.currency,
        boxUnits: this.config.catalog.boxUnits,
      },
    );
  }

  /** The told and current versions as one sentence, cut at the placeholders so
   * each is a link; the punctuation stays the deployment's. */
  protected readonly behind = computed((): BehindPart[] => {
    const order = this.detail();
    if (!order) return [];
    const numbers: Record<string, number> = {
      '{seen}': order.customerRevisionNumber,
      '{current}': order.revisionNumber,
    };
    // One sentence whether level or behind.
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

  /** Whether anything was ever said, and about what. */
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

  /** What is left for the customer, in order: their page first, as a mail must
   * not link to an unseen version; then the mail, re-sendable for a spam
   * folder. */
  protected readonly customerAction = computed(() => {
    const order = this.detail();
    // Erased: the mail would reach the placeholder.
    if (!order || this.locked() || order.personalDataRemovedAt) return null;
    if (order.customerRevisionNumber < order.revisionNumber) {
      return {
        kind: 'update' as const,
        label: this.tellText.update,
        icon: arrowRightIcon,
      };
    }
    return {
      kind: 'email' as const,
      label:
        order.notifiedRevisionNumber < order.customerRevisionNumber
          ? this.tellText.email
          : this.tellText.emailAgain,
      icon: sendIcon,
    };
  });

  protected revisionCount(order: AdminOrderDetail): string {
    return fillText(this.adminText.countSuffix, {
      count: order.revisionNumber,
    });
  }

  /** Moves their page on, or writes about the version they hold: one decision,
   * one endpoint. */
  protected async tellCustomer(
    order: AdminOrderDetail,
    kind: 'update' | 'email',
  ): Promise<void> {
    const tell = this.tellText;
    const asked =
      kind === 'update'
        ? {
            ...confirmRequest(tell.updateConfirm),
            checks: [
              {
                key: NOTIFY,
                label: tell.updateNotify,
                hint: this.text.notifyHint,
                // Ticked: an unseen version is news; the button stays for
                // later.
                checked: true,
              },
            ],
          }
        : { ...confirmRequest(tell.emailConfirm), checks: [] };

    const answer = await this.confirm.askDetailed({
      ...asked,
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

  /** The staff transition table, narrowed to what has an endpoint (an
   * adjustment is its own) and to better words: a request is declined, not
   * cancelled. */
  protected readonly moves = computed(() => {
    const order = this.detail();
    // Erased is final (NFR-LEGAL-14).
    if (!order || this.locked() || order.personalDataRemovedAt) return [];
    return allowedTransitions('staff', order.status)
      .filter((to) => !(to === 'cancelled' && order.status === 'requested'))
      .map((to) => ({
        to,
        label: this.moveLabel(to, order),
        // The glyph says which way; ending marks match the list's.
        icon: transitionHasReason(to)
          ? circleSlashIcon
          : backwards(order.status, to)
            ? arrowLeftIcon
            : arrowRightIcon,
        // A correction, not the next step: drawn quietly.
        variant: transitionHasReason(to)
          ? ('dangerOutline' as const)
          : backwards(order.status, to)
            ? ('secondary' as const)
            : ('primary' as const),
        run: () => this.move(order, to),
      }));
  });

  /** Named by direction: "Back to confirmed" undoes a click, "Confirm" answers
   * the order. */
  private moveLabel(to: OrderStatus, order: AdminOrderDetail): string {
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
      // Read through fulfilment, as the badge is.
      ready:
        order.fulfilmentMethod === 'pickup'
          ? actions.readyPickup
          : actions.ready,
      completed: actions.complete,
      declined: actions.decline,
      cancelled: actions.cancel,
    }[to];
  }

  /** The confirmation's ticks: their page, the mail, and on handover the money.
   * Preset, never inferred: a mail cannot be taken back, and a side-effect
   * payment is forgotten. The page tick clears only for a step taken in error.
   * */
  private moveChecks(order: AdminOrderDetail, to: OrderStatus): ConfirmCheck[] {
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
        // The payment slip travels with a mail sent while money is owed (FR-
        // ORD-05).
        hint: this.paymentNote(order, to)
          ? `${this.text.notifyHint} ${this.paymentNote(order, to)}`
          : this.text.notifyHint,
        checked: notifyByDefault(order.status, to, order.notifiedStatuses),
        requires: SHOW_CUSTOMER,
      },
    ];
    // Only with money owed and a handover; clearing a mis-tick stays the
    // payment row's job.
    if (order.paymentState !== 'paid' && !transitionHasReason(to)) {
      checks.push({
        key: MARK_PAID,
        label: actions.markPaid,
        hint: actions.markPaidHint,
        // Cash is paid at the handover; other methods may be owed for weeks.
        checked: to === 'completed' && order.paymentMethod === 'cash',
      });
    }
    return checks;
  }

  /** What the dialog says about payment: whether the slip rides along, from
   * `nextPaymentState`, the server's rule. `approved` on an invoiced order is
   * the case: one message that accepts and says how to pay. */
  private paymentNote(order: AdminOrderDetail, to: OrderStatus): string | null {
    const owing =
      nextPaymentState(order.paymentState, order.paymentMethod, to) ===
      'awaiting';
    if (!owing) return null;
    const supplied = order.documents.some(
      (document) =>
        document.kind === 'payment-instructions' &&
        document.source === 'supplied',
    );
    // No slip is worth noticing before the customer is told they owe.
    return supplied
      ? this.text.actions.notifyAttachment
      : this.text.actions.notifyNoDocument;
  }

  /** Confirmed, and the two endings ask why: the mail quotes it. A refusal
   * means somebody else answered first: reload. */
  private async move(order: AdminOrderDetail, to: OrderStatus): Promise<void> {
    const actions = this.text.actions;
    const label = this.moveLabel(to, order);
    const asked = {
      ...confirmRequest(actions.confirm),
      heading: fillText(actions.confirm.heading, { action: label }),
      confirmLabel: fillText(actions.confirm.confirm, { action: label }),
      checks: this.moveChecks(order, to),
      // Ending a paid order is allowed, but nothing refunds (FR-ORD-04); the
      // customer's cancel says the same.
      warning:
        order.paymentState === 'paid' && transitionHasReason(to)
          ? actions.confirm.warning
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
      this.order.reload();
      // A move writes a version: reload the thread too (an idle one fetches
      // nothing).
      this.revisions.reload();
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
    timeZone: this.config.orderReference?.timezone ?? 'UTC',
  });

  /** For the last move and the payment record: moments, not days. */
  private readonly dateTimeFormat = orderDateTimeFormat(this.config.locale);

  constructor() {
    void this.ownership.load();
    usePageSeo({ name: () => this.reference() });
  }
}
