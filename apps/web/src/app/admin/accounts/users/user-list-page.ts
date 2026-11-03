import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { SEARCH_QUERY_MAX_LENGTH } from '@b2b-catalog-platform/shared/core/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { formatPhone } from '../../../shared/core/contact-fields';
import { usePageSeo } from '../../../shared/core/page-seo';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { stableValue } from '../../../shared/core/stable-value';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { DataGrid } from '@b2b-catalog-platform/ui/grid/data-grid';
import { GridColumn } from '@b2b-catalog-platform/ui/grid/grid-column';
import { GridFilterOption } from '@b2b-catalog-platform/ui/grid/grid-filter-select';
import { GridCardTemplate } from '@b2b-catalog-platform/ui/grid/grid-card-template';
import { GridRowTemplate } from '@b2b-catalog-platform/ui/grid/grid-row-template';
import { GridTimestamp } from '../../dates/grid-timestamp';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { GridHeader } from '@b2b-catalog-platform/ui/grid/grid-header';
import { OwnershipService } from '../../platform/ownership/ownership.service';
import { TiersService } from '../../catalog/tiers/tiers.service';
import { UserRowActions } from './user-row-actions';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { StaffUsersService } from './users.service';
import {
  baseTierName,
  userRoleLabel,
  userStatusLabel,
  userStatusTone,
} from './user-status';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import {
  COMPANY_ID_NONE,
  formatPersonName,
  StaffUser,
  USER_STATUSES,
  UserKind,
  userStatusSchema,
} from '@b2b-catalog-platform/shared/core/accounts';
import { userRoleSchema } from '@b2b-catalog-platform/shared/platform';

const USER_SORTS = [
  'name',
  'name_desc',
  'type',
  'type_desc',
  'registered',
  'registered_desc',
  'status',
  'status_desc',
] as const;
type UserSort = (typeof USER_SORTS)[number];

/** Undecided registrations first: the reason a manager opens the list. */
const DEFAULT_USER_SORT: UserSort = 'status';

const STATUS_RANK: Record<StaffUser['status'], number> = {
  pending: 0,
  invited: 1,
  active: 2,
  disabled: 3,
  anonymized: 4,
};

/** A hand-edited parameter resolves to the default rather than nothing. */
function resolveUserSort(raw: string): UserSort {
  return (USER_SORTS as readonly string[]).includes(raw)
    ? (raw as UserSort)
    : DEFAULT_USER_SORT;
}

/** Person before company before none, so the type sort groups the two kinds. */
const TYPE_RANK: Record<string, number> = { person: 0, company: 1 };
const typeRank = (t: StaffUser['customerType']): number =>
  t ? TYPE_RANK[t] : 2;

/**
 * The account list, as two screens by the route's `kind`: customers, and
 * staff (admin and manager). Two screens, not two tabs: the split is a
 * permission boundary, and a manager sees only customers. Filters run on the
 * server; sorting runs here over the whole unpaged list.
 */
@Component({
  selector: 'app-user-list-page',
  imports: [
    Button,
    RouterLink,
    Icon,
    GridHeader,
    DataGrid,
    GridRowTemplate,
    GridCardTemplate,
    GridTimestamp,
    RecordRow,
    Skeleton,
    StatusBadge,
    UserRowActions,
    ErrorText,
  ],
  template: `
    <ui-grid-header
      [title]="page().title"
      [intro]="page().intro"
      [query]="query() ?? ''"
      [searchMaxLength]="searchMaxLength"
      [searchLabel]="text.searchAria"
      [searchPlaceholder]="text.searchPlaceholder"
      [clearSearchLabel]="text.clearSearch"
      [filtered]="filtered()"
    >
      <button uiButton type="button" class="gap-2" (click)="add()">
        <ui-icon [glyph]="plusIcon" class="size-4" />
        {{ isStaff() ? text.addStaff : text.addCustomer }}
      </button>
    </ui-grid-header>

    <!-- Where a raced decline or switch reports itself. -->
    @if (pageError()) {
      <p uiErrorText class="mb-4" role="alert">{{ pageError() }}</p>
    }

    @if (users.error()) {
      <p class="text-ink-subtle" role="alert">{{ text.loadError }}</p>
    } @else if (rows(); as data) {
      <ui-data-grid
        [gridId]="gridId()"
        [columns]="columns()"
        [rows]="data"
        [trackBy]="byId"
        [sort]="sortKey()"
        [defaultSort]="defaultSort"
        [muted]="isClosed"
        [busy]="users.isLoading()"
        [filtered]="filtered()"
        [emptyMessage]="filtered() ? text.noResults : text.empty"
        [countLabel]="text.count"
      >
        <ng-template uiGridRow [of]="data" let-user>
          <!-- Name and email in one cell, as on the order list. The name opens
               the account to read; the pencil opens the editor. -->
          <td class="truncate" [title]="user.email">
            <a
              class="block truncate font-medium text-ink hover:text-accent"
              [routerLink]="['/admin/users', user.id]"
              [queryParams]="editorFrom()"
            >
              {{ name(user) }}
            </a>
            <span class="block truncate text-xs text-ink-subtle">
              {{ user.email }}
            </span>
          </td>
          <td class="truncate text-ink-subtle" [title]="phone(user)">
            {{ phone(user) || dash }}
          </td>
          @if (isCustomers()) {
            <td
              class="truncate font-mono text-xs text-ink-subtle"
              [title]="user.companyRegistrationId"
            >
              {{ user.companyRegistrationId || dash }}
            </td>
          }
          @if (isStaff()) {
            <td class="text-ink-subtle">{{ roleLabel(user.role) }}</td>
          }
          @if (isCustomers()) {
            <td class="truncate text-ink-subtle">
              {{ tierName(user.tierId) }}
            </td>
          }
          <td data-keep>
            <span uiStatusBadge [tone]="statusTone(user.status)">{{
              statusLabel(user.status)
            }}</span>
          </td>
          <td class="text-ink-subtle">
            <app-grid-timestamp [value]="user.createdAt" />
          </td>
          <td data-keep>
            <app-user-row-actions
              [user]="user"
              [returnParams]="editorFrom()"
              (declined)="decline($event)"
              (activeChanged)="setActive($event.user, $event.active)"
            />
          </td>
        </ng-template>

        <ng-template uiGridCard [of]="data" let-user>
          <!-- Greyed when closed, but never the badge that says so. -->
          <ui-record-row>
            <a
              class="truncate font-medium text-ink"
              [class.opacity-50]="isClosed(user)"
              [routerLink]="['/admin/users', user.id]"
              [queryParams]="editorFrom()"
            >
              {{ name(user) }}
            </a>
            <span
              recordBadge
              uiStatusBadge
              class="shrink-0"
              [tone]="statusTone(user.status)"
              >{{ statusLabel(user.status) }}</span
            >
            <div recordBody [class.opacity-50]="isClosed(user)">
              <p class="mt-1 truncate text-sm text-ink-subtle">
                {{ user.email }}
              </p>
              @if (phone(user)) {
                <p class="truncate text-sm text-ink-subtle">
                  {{ phone(user) }}
                </p>
              }
            </div>
            <span
              recordMeta
              class="flex min-w-0 items-baseline gap-1"
              [class.opacity-50]="isClosed(user)"
            >
              <span class="truncate">
                {{ isStaff() ? roleLabel(user.role) : tierName(user.tierId) }} ·
              </span>
              <app-grid-timestamp [value]="user.createdAt" inline />
            </span>
            <app-user-row-actions
              recordActions
              [user]="user"
              [returnParams]="editorFrom()"
              (declined)="decline($event)"
              (activeChanged)="setActive($event.user, $event.active)"
            />
          </ui-record-row>
        </ng-template>
      </ui-data-grid>
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="6" />
    }
  `,
})
export class UserListPage {
  protected readonly searchMaxLength = SEARCH_QUERY_MAX_LENGTH;
  protected readonly plusIcon = plusIcon;
  private readonly service = inject(StaffUsersService);
  private readonly ownership = inject(OwnershipService);
  private readonly tiers = inject(TiersService);
  protected readonly text = inject(ADMIN_TEXT).users.list;
  protected readonly fields = inject(SHARED_TEXT).fields;
  protected readonly defaultSort = DEFAULT_USER_SORT;
  protected readonly dash = '—';

  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
  private readonly collator = new Intl.Collator(this.locale, {
    sensitivity: 'base',
  });

  /** Which side of the list this route shows, from its route `data`. */
  readonly kind = input<UserKind>('customer');
  protected readonly isCustomers = computed(() => this.kind() === 'customer');
  protected readonly isStaff = computed(() => this.kind() === 'staff');
  protected readonly page = computed(() =>
    this.isStaff() ? this.text.staffPage : this.text.customersPage,
  );

  // Query parameters, by name. Each is narrowed before the API sees it, so a
  // hand-edited URL falls back instead of earning a refusal.
  readonly searchTerm = input('');
  protected readonly query = computed(() =>
    this.searchTerm() ? this.searchTerm().trim() : undefined,
  );

  readonly status = input('');
  protected readonly statusKey = computed(() => {
    const parsed = userStatusSchema.safeParse(this.status());
    return parsed.success ? parsed.data : undefined;
  });
  protected readonly statusParam = computed(() => this.statusKey() ?? '');

  readonly role = input('');
  protected readonly roleKey = computed(() => {
    const parsed = userRoleSchema.safeParse(this.role());
    return parsed.success ? parsed.data : undefined;
  });
  protected readonly roleParam = computed(() => this.roleKey() ?? '');

  /** `default` (the base list) or a tier id; an unknown id matches nothing. */
  readonly tier = input('');
  protected readonly tierId = computed(() => this.tier() || undefined);

  /** A configured format's key; an unknown one matches nothing. */
  readonly companyIdFormat = input('');
  protected readonly companyIdFormatKey = computed(
    () => this.companyIdFormat() || undefined,
  );

  readonly sort = input('');
  protected readonly sortKey = computed(() => resolveUserSort(this.sort()));

  /** Separates "no accounts" from "no matches". */
  protected readonly filtered = computed(
    () =>
      !!this.query() ||
      !!this.statusKey() ||
      !!this.roleKey() ||
      !!this.tier() ||
      !!this.companyIdFormatKey(),
  );

  protected readonly users = resource({
    params: () => ({
      kind: this.kind(),
      status: this.statusKey(),
      role: this.roleKey(),
      tierId: this.tierId(),
      companyIdFormat: this.companyIdFormatKey(),
      q: this.query(),
    }),
    loader: ({ params }) => this.service.list(params),
  });

  /** Held across reloads, so the table swaps rows instead of blanking. */
  private readonly shown = stableValue(this.users);

  /** A sorted copy: `sort` mutates, and the resource's array is shared. */
  protected readonly rows = computed<StaffUser[] | undefined>(() => {
    const data = this.shown();
    return data ? [...data].sort(this.comparator()) : undefined;
  });

  protected readonly showSkeleton = delayedLoading(this.users.isLoading);

  private readonly tierList = resource({ loader: () => this.tiers.list() });
  private readonly tierNames = computed(
    () =>
      new Map((this.tierList.value()?.tiers ?? []).map((t) => [t.id, t.label])),
  );

  protected readonly tierOptions = computed<GridFilterOption[]>(() => [
    { value: '', label: this.text.tierAll },
    // The default list once, as `default`: its accounts hold a null tier.
    { value: 'default', label: this.baseTierLabel() },
    ...(this.tierList.value()?.tiers ?? [])
      .filter((t) => !t.isDefault)
      .map((t) => ({ value: t.id, label: t.label })),
  ]);

  /** Widths are remembered per kind: the two lists have different columns. */
  protected readonly gridId = computed(() => `users-${this.kind()}`);

  protected readonly columns = computed<GridColumn[]>(() => [
    {
      key: 'name',
      label: this.fields.name.label,
      sort: { asc: 'name', desc: 'name_desc' },
      minWidth: 180,
    },
    { key: 'phone', label: this.fields.phone.label, minWidth: 110 },
    ...(this.isCustomers()
      ? [
          {
            key: 'companyId',
            label: this.fields.companyId.label,
            minWidth: 100,
            ...(this.hasCompanyIdFormats
              ? {
                  filter: {
                    param: 'companyIdFormat',
                    options: this.companyIdFormatOptions,
                    value: this.companyIdFormat(),
                    label: this.text.filterCompanyIdFormat,
                  },
                }
              : {}),
          } satisfies GridColumn,
        ]
      : []),
    ...(this.isStaff()
      ? [
          {
            key: 'role',
            label: this.text.roleAll,
            minWidth: 110,
            filter: {
              param: 'role',
              options: this.staffRoleOptions,
              value: this.roleParam(),
              label: this.text.filterRole,
            },
          } satisfies GridColumn,
        ]
      : []),
    ...(this.isCustomers()
      ? [
          {
            key: 'tier',
            label: this.text.tierAll,
            minWidth: 110,
            filter: {
              param: 'tier',
              options: this.tierOptions(),
              value: this.tier(),
              label: this.text.filterTier,
            },
          } satisfies GridColumn,
        ]
      : []),
    {
      key: 'status',
      label: this.text.statusAll,
      sortName: this.text.status,
      minWidth: 110,
      sort: { asc: 'status', desc: 'status_desc' },
      filter: {
        param: 'status',
        options: this.statusOptions,
        value: this.statusParam(),
        label: this.text.filterStatus,
      },
    },
    {
      key: 'registered',
      label: this.text.registered,
      sort: { asc: 'registered', desc: 'registered_desc', descFirst: true },
      minWidth: 110,
    },
    // Two 24px glyphs, the gap and the cell's padding.
    {
      key: 'actions',
      srLabel: this.text.actionsAria,
      align: 'right',
      fixedWidth: 64,
    },
  ]);

  protected readonly byId = (user: StaffUser): string => user.id;

  /** Switched off or closed; a pending one is work, so it is not greyed. */
  protected readonly isClosed = (user: StaffUser): boolean =>
    user.status === 'disabled' || user.status === 'anonymized';

  protected readonly statusOptions: GridFilterOption[] = [
    { value: '', label: this.text.statusAll },
    ...USER_STATUSES.map((status) => ({
      value: status,
      label: userStatusLabel(this.text, status),
    })),
  ];

  /** "No number" too, so one-format deployments still get the filter. */
  private readonly companyIdFormats =
    inject(DEPLOYMENT_CONFIG).companyIdInput?.formats ?? [];
  protected readonly hasCompanyIdFormats = this.companyIdFormats.length > 0;
  protected readonly companyIdFormatOptions: GridFilterOption[] = [
    { value: '', label: this.text.companyIdFormatAll },
    { value: COMPANY_ID_NONE, label: this.text.companyIdFormatNone },
    ...this.companyIdFormats.map((format) => ({
      value: format.key,
      label: format.label ?? format.key,
    })),
  ];

  /** No customer role among staff. */
  protected readonly staffRoleOptions: GridFilterOption[] = [
    { value: '', label: this.text.roleAll },
    { value: 'admin', label: this.text.roleAdmin },
    { value: 'manager', label: this.text.roleManager },
  ];

  private readonly baseTierLabel = computed(() =>
    baseTierName(
      this.adminText.tiers.defaultName,
      this.tierList.value()?.tiers,
    ),
  );

  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly adminText = inject(ADMIN_TEXT);
  private readonly ownershipText = inject(ADMIN_TEXT).ownership;
  private readonly actionText = inject(SHARED_TEXT).actions;
  /** An editor opened from here returns to this list, filters and all. */
  protected readonly editorFrom = injectEditorReturnParams();

  /** While customers are owned elsewhere, a dialog explains instead of
   * asking: a vanished control teaches nobody why. */
  private lockedMessage(): string | null {
    return this.isCustomers() && this.ownership.owns('customers')
      ? this.ownershipText.accountActive
      : null;
  }

  /** While customers are owned elsewhere, explains instead of opening. */
  protected async add(): Promise<void> {
    const staff = this.isStaff();
    if (!staff && this.ownership.owns('customers')) {
      await this.confirm.tell({
        heading: this.text.addCustomer,
        message: this.ownershipText.accountCreate,
        closeLabel: this.actionText.close,
      });
      return;
    }
    void this.router.navigate(
      [staff ? '/admin/users/staff/new' : '/admin/users/new'],
      { queryParams: this.editorFrom() },
    );
  }

  protected readonly pageError = signal<string | null>(null);

  /** Confirmed both ways: off ends a session, on may mail a link. */
  protected async setActive(user: StaffUser, active: boolean): Promise<void> {
    this.pageError.set(null);
    const off = !active;
    const locked = this.lockedMessage();
    const dialog = off
      ? this.text.deactivateConfirm
      : this.text.reactivateConfirm;
    const ok = await this.confirm.ask({
      heading: dialog.heading,
      message: locked ?? fillText(dialog.message, { name: this.name(user) }),
      confirmLabel: locked ? null : dialog.confirm,
      cancelLabel: locked
        ? this.actionText.close
        : (dialog.cancel ?? this.actionText.cancel),
      confirmVariant: off ? 'danger' : 'primary',
    });
    if (locked || !ok) return;

    try {
      const result = await this.service.setActive(user.id, active);
      if (!result.ok) this.pageError.set(this.text.errors[result.code]);
    } catch {
      this.pageError.set(this.text.saveError);
    }
    this.users.reload();
  }

  /** A race (already approved) shows in the banner; the reload fixes the row. */
  protected async decline(user: StaffUser): Promise<void> {
    this.pageError.set(null);
    const locked = this.lockedMessage();
    const ok = await this.confirm.ask({
      heading: this.text.declineConfirm.heading,
      message:
        locked === null
          ? fillText(this.text.declineConfirm.message, {
              name: this.name(user),
            })
          : this.ownershipText.accountDecline,
      confirmLabel: locked ? null : this.text.declineConfirm.confirm,
      cancelLabel: locked
        ? this.actionText.close
        : (this.text.declineConfirm.cancel ?? this.actionText.cancel),
      confirmVariant: 'danger',
    });
    if (locked || !ok) return;

    try {
      const result = await this.service.remove(user.id);
      if (!result.ok) this.pageError.set(this.text.errors[result.code]);
    } catch {
      this.pageError.set(this.text.saveError);
    }
    this.users.reload();
  }

  private nameKey(user: StaffUser): string {
    return (this.name(user).trim() || user.email).toLowerCase();
  }

  protected name(user: StaffUser): string {
    return formatPersonName(user.firstName, user.lastName) || this.dash;
  }

  protected phone(user: StaffUser): string {
    return formatPhone(user.phone, this.phoneInput);
  }

  protected tierName(tierId: string | null): string {
    return tierId
      ? (this.tierNames().get(tierId) ?? this.dash)
      : this.baseTierLabel();
  }

  protected roleLabel(role: StaffUser['role']): string {
    return userRoleLabel(this.text, role);
  }

  protected statusLabel(status: StaffUser['status']): string {
    return userStatusLabel(this.text, status);
  }

  protected readonly statusTone = userStatusTone;

  private comparator(): (a: StaffUser, b: StaffUser) => number {
    const sort = this.sortKey();
    const sign = sort.endsWith('_desc') ? -1 : 1;
    type Compare = (a: StaffUser, b: StaffUser) => number;
    const byField: Record<string, Compare> = {
      name: (a, b) => this.collator.compare(this.nameKey(a), this.nameKey(b)),
      type: (a, b) => typeRank(a.customerType) - typeRank(b.customerType),
      registered: (a, b) => a.createdAt.localeCompare(b.createdAt),
      status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
    };
    const field = sort.replace(/_desc$/, '');
    const compare = byField[field];
    // Newest first inside a status group, either way round.
    return field === 'status'
      ? (a, b) => sign * compare(a, b) || b.createdAt.localeCompare(a.createdAt)
      : (a, b) => sign * compare(a, b);
  }

  constructor() {
    usePageSeo({ name: () => this.page().title });
    // Early, so a dialog never waits for it.
    void this.ownership.load();
  }
}
