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
  fillText,
  ORDER_STATUS_REASON_MAX,
  OrderStatus,
  orderStatusSchema,
  StaffOrderSort,
  staffOrderSortSchema,
  StaffPaymentFilter,
  staffPaymentFilterSchema,
  TransitionTarget,
} from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../../catalog/price';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { stableValue } from '../../core/stable-value';
import { Skeleton } from '../../ui/skeleton';
import { StatusBadge, StatusTone } from '../../ui/status-badge';
import {
  orderStatusLabel,
  orderStatusTone,
  staffPaymentBadge,
} from '../../orders/order-status';
import { AdminListHeader } from '../list-header';
import { AdminGrid } from '../grid/admin-grid';
import { GridColumn } from '../grid/grid-column';
import { GridFilterOption } from '../grid/grid-filter-select';
import { GridPagination } from '../grid/grid-pagination';
import { GridCardTemplate, GridRowTemplate } from '../grid/grid-templates';
import { GridTimestamp } from '../grid/grid-timestamp';
import { RecordRow } from '../records/record-row';
import { injectEditorReturnParams } from '../editor-return';
import { ConfirmService } from '../../ui/confirm.service';
import { OrderRowActions } from './order-row-actions';
import { AdminOrdersService, StaffOrderSummary } from './orders.service';

/**
 * Every order request, for staff (FR-AUTH-03). An order is answered on its own
 * page; what the list carries is the pair of moves worth making without opening
 * one — the two the row's own state offers.
 *
 * Newest first, narrowed by the status and by the find-an-order box — the two
 * questions a manager opens this list with: "what have I not answered yet?"
 * and "where is the one they are asking about on the phone?". Both are query
 * parameters like every other grid's, so a narrowed list is shareable and
 * survives a reload, and both are applied server-side: the list is paged, and
 * a box that filtered one page would be a lie.
 */
@Component({
  selector: 'app-admin-order-list-page',
  imports: [
    RouterLink,
    AdminListHeader,
    AdminGrid,
    GridRowTemplate,
    GridCardTemplate,
    GridPagination,
    GridTimestamp,
    Skeleton,
    StatusBadge,
    RecordRow,
    OrderRowActions,
  ],
  template: `
    <app-admin-list-header
      [title]="text.title"
      [query]="query()"
      [searchLabel]="text.searchLabel"
      [searchPlaceholder]="text.searchPlaceholder"
      [clearSearchLabel]="text.clearSearch"
      [filtered]="filtered()"
    />

    @if (pageError(); as message) {
      <p class="mb-4 text-sm text-red-600" role="alert">{{ message }}</p>
    }

    @if (orders.error()) {
      <p class="text-muted" role="alert">{{ text.loadError }}</p>
    } @else if (shown(); as data) {
      <app-admin-grid
        gridId="orders"
        [columns]="columns()"
        [rows]="data.items"
        [trackBy]="byReference"
        [sort]="sortKey()"
        [defaultSort]="defaultSort"
        [muted]="isEnded"
        [busy]="orders.isLoading()"
        [filtered]="filtered()"
        [emptyMessage]="filtered() ? text.noResults : text.empty"
      >
        <ng-template appGridRow [of]="data.items" let-order>
          <td class="truncate font-medium">
            <a
              class="hover:text-accent"
              [routerLink]="['/admin/orders', order.reference]"
            >
              {{ order.reference }}
            </a>
          </td>
          <!-- Who to call, and underneath the account it came from — or
               that it came from nobody, which is what a guest order is. -->
          <td class="truncate" [title]="order.customerEmail ?? ''">
            <span class="block truncate text-stone-700">
              {{ order.contactName }}
            </span>
            <span class="block truncate text-xs text-subtle">
              {{ order.customerEmail ?? text.guest }}
            </span>
          </td>
          <td class="truncate text-subtle">
            {{ lineCount(order.itemCount) }}
          </td>
          <td class="tabular-nums">{{ total(order) }}</td>
          <!-- The money, in the quiet badge: it is the order's second fact,
               and two solid pills in one row read as two statuses that could
               disagree. Empty where nothing is owed yet — a cash order says
               nothing about money until it is handed over. -->
          <td data-keep>
            @if (paymentBadge(order); as badge) {
              <span appStatusBadge variant="dot" [tone]="badge.tone">
                {{ badge.label }}
              </span>
            }
          </td>
          <td data-keep>
            <span appStatusBadge [tone]="statusTone(order)">
              {{ statusLabel(order) }}
            </span>
          </td>
          <td class="text-subtle">
            <app-grid-timestamp [value]="order.createdAt" />
          </td>
          <td data-keep>
            <app-order-row-actions
              [order]="order"
              [returnParams]="editorFrom()"
              (endRequested)="end($event.order, $event.to)"
            />
          </td>
        </ng-template>

        <!-- The same order on a phone: what it is and where it stands on the
             first line, who to call on the second, and the two figures a
             manager is looking for — when it came in and what it comes to — on
             the third. The account it came from is a detail for the order's own
             page; the name and the reference are what a phone call is about. -->
        <ng-template appGridCard [of]="data.items" let-order>
          <!-- Only the order is greyed once it is over, never the badge that
               says so — the same rule the table follows cell by cell. -->
          <app-record-row>
            <a
              class="truncate font-medium"
              [class.opacity-50]="isEnded(order)"
              [routerLink]="['/admin/orders', order.reference]"
              >{{ order.reference }}</a
            >

            <!-- Beside the status, never instead of it, and in the quiet
                 variant: what is owed is a second fact about the order. -->
            @if (paymentBadge(order); as badge) {
              <span
                recordBadge
                appStatusBadge
                variant="dot"
                class="shrink-0"
                [tone]="badge.tone"
              >
                {{ badge.label }}
              </span>
            }
            <span
              recordBadge
              appStatusBadge
              class="shrink-0"
              [tone]="statusTone(order)"
            >
              {{ statusLabel(order) }}
            </span>
            <p
              recordBody
              class="mt-1 truncate text-subtle"
              [class.opacity-50]="isEnded(order)"
            >
              {{ order.contactName }}
            </p>
            <!-- When it came in, what is on it and what it comes to: the three
                 figures a manager scans a phone list for. The buttons take the
                 slot the total used to, which is what every other card does
                 with its bottom-right corner. -->
            <span
              recordMeta
              class="flex min-w-0 items-baseline gap-1"
              [class.opacity-50]="isEnded(order)"
            >
              <app-grid-timestamp [value]="order.createdAt" inline />
              <span class="truncate">
                · {{ lineCount(order.itemCount) }} ·
                <span class="tabular-nums">{{ total(order) }}</span>
              </span>
            </span>
            <app-order-row-actions
              recordActions
              [order]="order"
              [returnParams]="editorFrom()"
              (endRequested)="end($event.order, $event.to)"
            />
          </app-record-row>
        </ng-template>
      </app-admin-grid>

      <app-grid-pagination [pagination]="data.pagination" />
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }
  `,
})
export class AdminOrderListPage {
  private readonly api = inject(AdminOrdersService);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  protected readonly text = inject(ADMIN_TEXT).orderList;

  /** Bound from the query parameters; both are narrowed before they reach the
   * API, so a hand-edited URL falls back to the default view. */
  readonly page = input('1');
  readonly status = input('');
  /**
   * Named for the parameter it is bound from — router input binding matches on
   * the name, and the find-a-row box writes `searchTerm`. `q` is the navbar
   * search's own parameter and is never read here.
   */
  readonly searchTerm = input('');

  private readonly currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  protected readonly statusKey = computed<OrderStatus | undefined>(() => {
    const parsed = orderStatusSchema.safeParse(this.status());
    return parsed.success ? parsed.data : undefined;
  });
  /** The filter's own value: the empty string is "no filter", never undefined,
   * or the select falls back to its first option by accident rather than by
   * agreement. */
  protected readonly statusParam = computed(() => this.statusKey() ?? '');

  /** The payment column's own narrowing, parsed the same way. */
  readonly payment = input('');
  protected readonly paymentKey = computed<StaffPaymentFilter | undefined>(
    () => {
      const parsed = staffPaymentFilterSchema.safeParse(this.payment());
      return parsed.success ? parsed.data : undefined;
    },
  );
  protected readonly paymentParam = computed(() => this.paymentKey() ?? '');

  /**
   * The three things the column says, and nothing for the orders it says
   * nothing about: an unanswered order owes nobody anything yet.
   */
  protected readonly paymentOptions: GridFilterOption[] = [
    { value: '', label: this.text.paymentAll },
    { value: 'awaiting', label: this.text.paymentAwaiting },
    { value: 'cash', label: this.text.paymentCash },
    { value: 'paid', label: this.text.paymentPaid },
  ];

  /**
   * The ordering, server-side like the filter: the list is paged, and sorting
   * one page would be sorting one twentieth of the orders. The default is
   * unanswered-first, which is the question this screen is opened with — so it
   * is the sort written as an *absent* parameter.
   */
  readonly sort = input('');
  protected readonly defaultSort: StaffOrderSort = 'status';
  protected readonly sortKey = computed<StaffOrderSort>(() => {
    const parsed = staffOrderSortSchema.safeParse(this.sort());
    return parsed.success ? parsed.data : this.defaultSort;
  });

  /**
   * Router input binding sets an *absent* parameter to undefined, whatever the
   * input's default says — so every one of these is read through a guard
   * rather than used straight. A page opened from the panel carries no
   * parameters at all.
   */
  protected readonly query = computed(() =>
    this.searchTerm() ? this.searchTerm().trim() : '',
  );
  protected readonly filtered = computed(
    () => !!this.statusKey() || !!this.paymentKey() || !!this.query(),
  );

  protected readonly orders = resource({
    params: () => ({
      page: this.currentPage(),
      status: this.statusKey(),
      payment: this.paymentKey(),
      q: this.query() || undefined,
      sort: this.sortKey(),
    }),
    loader: ({ params }) => this.api.list(params),
  });

  /** Held across reloads, so filtering or paging swaps the rows instead of
   * blanking the table the filter sits in. */
  protected readonly shown = stableValue(this.orders);
  protected readonly showSkeleton = delayedLoading(this.orders.isLoading);

  /**
   * The columns, declared once: the headings on a desktop, the filter sheet and
   * the sort picker on a phone, and the widths an admin drags all read the same
   * list. A computed because the status filter's own value is part of it.
   */
  protected readonly columns = computed<GridColumn[]>(() => [
    { key: 'reference', label: this.text.reference, minWidth: 140 },
    { key: 'customer', label: this.text.customer, minWidth: 140 },
    { key: 'items', label: this.text.items, minWidth: 80 },
    { key: 'total', label: this.text.total, minWidth: 90 },
    // Filtered, not sorted: an ordering of three unrelated readings is not a
    // question anybody asks, but "what is still owed me" is — and a cash order
    // waiting to be ticked is the one piece of work that would otherwise sit
    // in the list looking exactly like an unanswered request.
    {
      key: 'payment',
      label: this.text.paymentAll,
      sortName: this.text.payment,
      filter: {
        param: 'payment',
        options: this.paymentOptions,
        value: this.paymentParam(),
        ariaLabel: this.text.filterPayment,
      },
      minWidth: 130,
    },
    {
      key: 'status',
      label: this.text.statusAll,
      sortName: this.text.status,
      // The one column that both filters and sorts: what a manager narrows by
      // is also what they want at the top when they open the list.
      sort: { asc: 'status', desc: 'status_desc' },
      filter: {
        param: 'status',
        options: this.statusOptions,
        value: this.statusParam(),
        ariaLabel: this.text.filterStatus,
      },
      minWidth: 110,
    },
    {
      key: 'placed',
      label: this.text.placed,
      sort: { asc: 'placed', desc: 'placed_desc', descFirst: true },
      minWidth: 110,
    },
    // Two glyphs at 24px, with the gap and the cell's own padding.
    {
      key: 'actions',
      srLabel: this.text.actions,
      align: 'right',
      fixedWidth: 64,
    },
  ]);

  protected readonly byReference = (order: StaffOrderSummary): string =>
    order.reference;

  /** An order nobody is going to act on again, greyed the way a deleted
   * product is: it is still listed, but it is not work. */
  protected readonly isEnded = (order: StaffOrderSummary): boolean =>
    order.status === 'declined' ||
    order.status === 'cancelled' ||
    order.status === 'completed';

  /**
   * One option per status, `ready` included once: the filter picks a state,
   * and the two readings of that state are one thing to filter by. The label
   * is the delivery wording, which is the one that describes the shop's own
   * work rather than where the goods are waiting.
   */
  protected readonly statusOptions: GridFilterOption[] = [
    { value: '', label: this.text.statusAll },
    { value: 'requested', label: this.text.statusRequested },
    { value: 'approved', label: this.text.statusApproved },
    { value: 'adjusted', label: this.text.statusAdjusted },
    { value: 'ready', label: this.text.statusReadyDelivery },
    { value: 'completed', label: this.text.statusCompleted },
    { value: 'declined', label: this.text.statusDeclined },
    { value: 'cancelled', label: this.text.statusCancelled },
  ];

  protected total(order: StaffOrderSummary): string {
    return formatPriceMinor(order.totalMinor, this.currency);
  }

  protected lineCount(count: number): string {
    return fillText(this.text.itemCount, { count });
  }

  protected statusLabel(order: StaffOrderSummary): string {
    return orderStatusLabel(order.status, order.fulfilmentMethod, this.text);
  }

  protected statusTone(order: StaffOrderSummary): StatusTone {
    return orderStatusTone(order.status, 'staff', order.fulfilmentMethod);
  }

  protected paymentBadge(
    order: StaffOrderSummary,
  ): { label: string; tone: StatusTone } | null {
    return staffPaymentBadge(order, this.text);
  }

  // --- Row actions -------------------------------------------------------

  private readonly confirm = inject(ConfirmService);
  private readonly detailText = inject(ADMIN_TEXT).orderDetail;
  private readonly common = inject(ADMIN_TEXT).common;
  /** So the order page opened from here returns to this list, filters and
   * all. */
  protected readonly editorFrom = injectEditorReturnParams();

  /** For the one action that is not a navigation: a row somebody else answered
   * first. */
  protected readonly pageError = signal<string | null>(null);

  /**
   * End an order from the list — declining a request, or cancelling one the
   * shop had taken on. Confirmed with a reason, because both are quoted at the
   * customer in the mail the move sends.
   *
   * Whether the move is allowed is still the server's answer: the row may have
   * been answered by somebody else while this list was open, and the reload
   * corrects it while the banner says what happened.
   */
  protected async end(
    order: StaffOrderSummary,
    to: TransitionTarget,
  ): Promise<void> {
    this.pageError.set(null);
    const actions = this.detailText.actions;
    const label = to === 'declined' ? actions.decline : actions.cancel;
    const reason = await this.confirm.askWithReason({
      heading: fillText(actions.confirmHeading, { action: label }),
      message: actions.confirmMessage,
      confirmLabel: label,
      cancelLabel: this.common.cancel,
      reasonLabel: actions.reasonLabel,
      reasonMaxLength: ORDER_STATUS_REASON_MAX,
    });
    if (reason === null) return;

    try {
      const moved = await this.api.transition(order.reference, to, reason);
      if (!moved) this.pageError.set(actions.error);
    } catch {
      this.pageError.set(actions.error);
    }
    this.orders.reload();
  }

  constructor() {
    usePageSeo({ name: () => this.text.title });
  }
}
