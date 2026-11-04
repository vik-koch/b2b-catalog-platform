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
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared/platform';
import {
  notifyByDefault,
  ORDER_STATUS_REASON_MAX,
  OrderStatus,
  orderStatusSchema,
  StaffOrderSort,
  staffOrderSortSchema,
  StaffPaymentFilter,
  staffPaymentFilterSchema,
} from '@b2b-catalog-platform/shared/core/ordering';
import { SEARCH_QUERY_MAX_LENGTH } from '@b2b-catalog-platform/shared/core/catalog';
import { ADMIN_TEXT } from '../../platform/config/admin-text';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { delayedLoading } from '../../platform/delayed-loading';
import { usePageSeo } from '../../platform/page-seo';
import { stableValue } from '../../platform/stable-value';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import {
  orderStatusLabel,
  orderStatusTone,
  staffPaymentBadge,
} from '../../core/ordering/order-status';
import { GridHeader } from '@b2b-catalog-platform/ui/grid/grid-header';
import { DataGrid } from '@b2b-catalog-platform/ui/grid/data-grid';
import { GridColumn } from '@b2b-catalog-platform/ui/grid/grid-column';
import { GridFilterOption } from '@b2b-catalog-platform/ui/grid/grid-filter-select';
import { GridPagination } from '@b2b-catalog-platform/ui/grid/grid-pagination';
import { GridCardTemplate } from '@b2b-catalog-platform/ui/grid/grid-card-template';
import { GridRowTemplate } from '@b2b-catalog-platform/ui/grid/grid-row-template';
import { GridTimestamp } from '../dates/grid-timestamp';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { injectEditorReturnParams } from '../../platform/edit-mode/editor-return';
import {
  ConfirmService,
  confirmRequest,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { OwnershipService } from '../platform/ownership/ownership.service';
import { OrderRowActions } from './ui/order-row-actions';
import { AdminOrdersService } from './orders.service';
import { StaffOrderSummary } from '@b2b-catalog-platform/shared/admin/ordering';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';

/** Every order request, for staff (FR-AUTH-03); answered on its own page, with
 * the row's two moves here. Status, search, payment and sort are query
 * parameters applied server-side: the list is paged. */
@Component({
  selector: 'app-admin-order-list-page',
  imports: [
    RouterLink,
    GridHeader,
    DataGrid,
    GridRowTemplate,
    GridCardTemplate,
    GridPagination,
    GridTimestamp,
    Skeleton,
    StatusBadge,
    RecordRow,
    OrderRowActions,
    ErrorText,
  ],
  template: `
    <ui-grid-header
      [title]="text.page.title"
      [intro]="text.page.intro"
      [query]="query()"
      [searchMaxLength]="searchMaxLength"
      [searchLabel]="text.searchAria"
      [searchPlaceholder]="text.searchPlaceholder"
      [clearSearchLabel]="text.clearSearch"
      [filtered]="filtered()"
    />

    @if (pageError(); as message) {
      <p uiErrorText class="mb-4" role="alert">{{ message }}</p>
    }

    @if (orders.error()) {
      <p class="text-ink-subtle" role="alert">{{ text.loadError }}</p>
    } @else if (shown(); as data) {
      <ui-data-grid
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
        [total]="data.pagination.total"
        [countLabel]="text.count"
      >
        <ng-template uiGridRow [of]="data.items" let-order>
          <!-- The reference reads the order; the row's action answers it. -->
          <td class="truncate font-medium">
            <a class="hover:text-accent" [routerLink]="titleLink(order)">
              {{ order.reference }}
            </a>
          </td>
          <!-- Who to call, and the account, or none for a guest. -->
          <td class="truncate" [title]="order.customerEmail ?? ''">
            <span class="block truncate text-ink">
              {{ order.contactName }}
            </span>
            <span class="block truncate text-xs text-ink-subtle">
              {{ order.customerEmail ?? ordersText.guest }}
            </span>
          </td>
          <td class="truncate text-ink-subtle">
            {{ lineCount(order.itemCount) }}
          </td>
          <td class="tabular-nums">{{ total(order) }}</td>
          <!-- The quiet badge: two solid pills read as statuses that disagree.
               Empty while nothing is owed. -->
          <td data-keep>
            @if (paymentBadge(order); as badge) {
              <span uiStatusBadge variant="dot" [tone]="badge.tone">
                {{ badge.label }}
              </span>
            }
          </td>
          <td data-keep>
            <span uiStatusBadge [tone]="statusTone(order)">
              {{ statusLabel(order) }}
            </span>
          </td>
          <td class="text-ink-subtle">
            <app-grid-timestamp [value]="order.createdAt" />
          </td>
          <td data-keep>
            <app-order-row-actions
              [order]="order"
              [locked]="locked()"
              [returnParams]="editorFrom()"
              (endRequested)="end($event.order, $event.to)"
            />
          </td>
        </ng-template>

        <!-- On a phone: order and status, who to call, then date, lines and
             total. -->
        <ng-template uiGridCard [of]="data.items" let-order>
          <!-- Only the order greys once over, never its badge. -->
          <ui-record-row>
            <a
              class="truncate font-medium"
              [class.opacity-50]="isEnded(order)"
              [routerLink]="titleLink(order)"
              >{{ order.reference }}</a
            >

            <!-- Beside the status, quiet: a second fact. -->
            @if (paymentBadge(order); as badge) {
              <span
                recordBadge
                uiStatusBadge
                variant="dot"
                class="shrink-0"
                [tone]="badge.tone"
              >
                {{ badge.label }}
              </span>
            }
            <span
              recordBadge
              uiStatusBadge
              class="shrink-0"
              [tone]="statusTone(order)"
            >
              {{ statusLabel(order) }}
            </span>
            <p
              recordBody
              class="mt-1 truncate text-ink-subtle"
              [class.opacity-50]="isEnded(order)"
            >
              {{ order.contactName }}
            </p>
            <!-- The buttons take the card's bottom-right corner. -->
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
              [locked]="locked()"
              [returnParams]="editorFrom()"
              (endRequested)="end($event.order, $event.to)"
            />
          </ui-record-row>
        </ng-template>
      </ui-data-grid>

      <ui-grid-pagination [pagination]="data.pagination" />
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="6" />
    }
  `,
})
export class AdminOrderListPage {
  protected readonly searchMaxLength = SEARCH_QUERY_MAX_LENGTH;
  private readonly api = inject(AdminOrdersService);
  private readonly ownership = inject(OwnershipService);
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));

  protected readonly text = inject(ADMIN_TEXT).orders.list;
  protected readonly names = inject(SHARED_TEXT).order;
  protected readonly ordersText = inject(ADMIN_TEXT).orders;
  private readonly statuses = this.ordersText.statuses;

  /** Whether an external system answers orders (FR-ADM-10); in flight counts as
   * not owned. The API refuses either way. */
  protected readonly locked = computed(() => this.ownership.owns('orders'));

  /** Narrowed before the API, so a hand-edited URL falls back to the default.
   * */
  readonly page = input('1');
  readonly status = input('');
  /** Named for its parameter: the find-a-row box writes `searchTerm`; `q` is
   * the navbar search's. */
  readonly searchTerm = input('');

  private readonly currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  protected readonly statusKey = computed<OrderStatus | undefined>(() => {
    const parsed = orderStatusSchema.safeParse(this.status());
    return parsed.success ? parsed.data : undefined;
  });
  /** Empty string, never undefined, for no filter: otherwise the select picks
   * its first option. */
  protected readonly statusParam = computed(() => this.statusKey() ?? '');

  readonly payment = input('');
  protected readonly paymentKey = computed<StaffPaymentFilter | undefined>(
    () => {
      const parsed = staffPaymentFilterSchema.safeParse(this.payment());
      return parsed.success ? parsed.data : undefined;
    },
  );
  protected readonly paymentParam = computed(() => this.paymentKey() ?? '');

  /** The column's three readings. */
  protected readonly paymentOptions: GridFilterOption[] = [
    { value: '', label: this.text.paymentAll },
    { value: 'awaiting', label: this.ordersText.paymentStates.awaiting },
    {
      value: 'cash',
      label: this.ordersText.paymentStates.cashOnHandover,
    },
    { value: 'unpaid', label: this.text.paymentUnpaid },
    { value: 'paid', label: this.ordersText.paymentStates.paid },
  ];

  /** Server-side, as the list is paged. Unanswered-first is the default,
   * written as an absent parameter. */
  readonly sort = input('');
  protected readonly defaultSort: StaffOrderSort = 'status';
  protected readonly sortKey = computed<StaffOrderSort>(() => {
    const parsed = staffOrderSortSchema.safeParse(this.sort());
    return parsed.success ? parsed.data : this.defaultSort;
  });

  /** An absent parameter arrives as undefined whatever the default, so each is
   * guarded. */
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

  /** Held across reloads, so filtering swaps rows rather than blanking the
   * table. */
  protected readonly shown = stableValue(this.orders);
  protected readonly showSkeleton = delayedLoading(this.orders.isLoading);

  /** The columns, read by the desktop headings, the phone's filter sheet and
   * sort picker, and the dragged widths. Computed: the status filter's value is
   * part of it. */
  protected readonly columns = computed<GridColumn[]>(() => [
    { key: 'reference', label: this.names.reference, minWidth: 140 },
    { key: 'customer', label: this.text.customer, minWidth: 140 },
    { key: 'items', label: this.text.items, minWidth: 80 },
    { key: 'total', label: this.names.total, minWidth: 90 },
    // Filtered, not sorted: "what is still owed" is a question, and an unticked
    // cash order otherwise looks unanswered.
    {
      key: 'payment',
      label: this.text.paymentAll,
      sortName: this.names.payment,
      filter: {
        param: 'payment',
        options: this.paymentOptions,
        value: this.paymentParam(),
        label: this.text.filterPayment,
      },
      minWidth: 130,
    },
    {
      key: 'status',
      label: this.text.statusAll,
      sortName: this.names.status,
      // Filters and sorts: what a manager narrows by, they want on top.
      sort: { asc: 'status', desc: 'status_desc' },
      filter: {
        param: 'status',
        options: this.statusOptions,
        value: this.statusParam(),
        label: this.text.filterStatus,
      },
      minWidth: 110,
    },
    {
      key: 'placed',
      label: this.text.placed,
      sort: { asc: 'placed', desc: 'placed_desc', descFirst: true },
      minWidth: 110,
    },
    // Two 24px glyphs, the gap and the cell padding.
    {
      key: 'actions',
      srLabel: this.text.actionsAria,
      align: 'right',
      fixedWidth: 64,
    },
  ]);

  protected readonly byReference = (order: StaffOrderSummary): string =>
    order.reference;

  /** Ended orders grey like a deleted product: listed, but not work. */
  protected readonly isEnded = (order: StaffOrderSummary): boolean =>
    order.status === 'declined' ||
    order.status === 'cancelled' ||
    order.status === 'completed';

  /** `ready` once, in the delivery wording, which names the shop's own work. */
  protected readonly statusOptions: GridFilterOption[] = [
    { value: '', label: this.text.statusAll },
    { value: 'requested', label: this.statuses.requested },
    { value: 'approved', label: this.statuses.approved },
    { value: 'ready', label: this.statuses.readyDelivery },
    { value: 'completed', label: this.statuses.completed },
    { value: 'declined', label: this.statuses.declined },
    { value: 'cancelled', label: this.statuses.cancelled },
  ];

  protected total(order: StaffOrderSummary): string {
    return formatMoneyMinor(order.totalMinor, this.currency);
  }

  protected lineCount(count: number): string {
    return fillText(this.text.itemCount, { count });
  }

  protected statusLabel(order: StaffOrderSummary): string {
    return orderStatusLabel(
      order.status,
      order.fulfilmentMethod,
      this.statuses,
    );
  }

  protected statusTone(order: StaffOrderSummary): StatusTone {
    return orderStatusTone(order.status, 'staff', order.fulfilmentMethod);
  }

  protected paymentBadge(
    order: StaffOrderSummary,
  ): { label: string; tone: StatusTone } | null {
    return staffPaymentBadge(order, this.ordersText.paymentStates);
  }

  private readonly confirm = inject(ConfirmService);
  private readonly detailText = inject(ADMIN_TEXT).orders.detail;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  /** So the order page returns to this list, filters and all. */
  protected readonly editorFrom = injectEditorReturnParams();

  /** Says a row was answered by somebody else first. */
  protected readonly pageError = signal<string | null>(null);

  /** Declines or cancels from the list, with a reason quoted in the customer's
   * mail. A refusal means somebody else answered first: the reload corrects the
   * row. */
  protected async end(
    order: StaffOrderSummary,
    to: OrderStatus,
  ): Promise<void> {
    this.pageError.set(null);
    const actions = this.detailText.actions;
    const label = to === 'declined' ? actions.decline : actions.cancel;
    const answer = await this.confirm.askDetailed({
      ...confirmRequest(actions.confirm),
      heading: fillText(actions.confirm.heading, { action: label }),
      confirmLabel: fillText(actions.confirm.confirm, { action: label }),
      reasonLabel: actions.reasonLabel,
      reasonMaxLength: ORDER_STATUS_REASON_MAX,
      // Always told: an ending is news nobody may skip, and an ended order must
      // reach their page.
      checks: [
        {
          key: 'notify',
          label: actions.notify,
          hint: this.detailText.notifyHint,
          checked: notifyByDefault(order.status, to, []),
        },
      ],
    });
    if (!answer) return;

    try {
      const moved = await this.api.transition(
        order.reference,
        to,
        answer.reason,
        {
          showCustomer: true,
          notify: answer.checks['notify'] ?? false,
          markPaid: false,
        },
      );
      if (!moved) this.pageError.set(actions.error);
    } catch {
      this.pageError.set(actions.error);
    }
    this.orders.reload();
  }

  /** The reference opens the current version as the customer sees it. While an
   * external system holds processing, both links go to the order page, the
   * fuller read. */
  protected titleLink(order: StaffOrderSummary): unknown[] {
    return this.locked()
      ? ['/admin/orders', order.reference]
      : ['/admin/orders', order.reference, 'revisions', order.revisionNumber];
  }

  constructor() {
    usePageSeo({ name: () => this.text.page.title });
    void this.ownership.load();
  }
}
