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
  COMPANY_ID_NONE,
  StaffUser,
  UserKind,
  userRoleSchema,
  userStatusSchema,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { formatPhone } from '../../core/contact-fields';
import { usePageSeo } from '../../core/page-seo';
import { delayedLoading } from '../../core/delayed-loading';
import { stableValue } from '../../core/stable-value';
import { Button } from '../../ui/button';
import { ConfirmService } from '../../ui/confirm.service';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Skeleton } from '../../ui/skeleton';
import { AdminGrid } from '../grid/admin-grid';
import { GridColumn } from '../grid/grid-column';
import { GridFilterOption } from '../grid/grid-filter-select';
import { GridCardTemplate, GridRowTemplate } from '../grid/grid-templates';
import { GridTimestamp } from '../grid/grid-timestamp';
import { AdminListHeader } from '../list-header';
import { TiersService } from '../tiers/tiers.service';
import { UserRowActions } from './user-row-actions';
import { injectEditorReturnParams } from '../editor-return';
import { StatusBadge } from '../../ui/status-badge';
import { StaffUsersService } from './users.service';
import { userStatusTone } from './user-status';

/**
 * The staff account list (FR-AUTH-03/04). One component, two views chosen by the
 * route's `kind`: **Customers** (the `user` role) and **Staff** (admin and
 * manager). They are two screens reached from two buttons on the admin panel,
 * not two tabs on one screen: the split is a permission boundary, and a manager
 * who can only ever see customers should not be shown a switch that names a
 * second list they may not open — for them this is simply "Customers".
 *
 * Every row action but one is a link into the account editor, which is where
 * approving, re-tiering and correcting details all happen. Declining stays
 * here: it destroys a row rather than opening it, so a confirm is the whole
 * interaction.
 *
 * Filters and search are server-side (the URL is the state, same as the product
 * grid); sorting is done here over the fetched rows, because the list is a few
 * hundred accounts at most and unpaged, so a comparator is the whole of it.
 */
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

/**
 * Registrations nobody has decided on first — the reason a manager opens this
 * list — then the accounts in use, then the ones that are over. Everything
 * else about the order is a click away in a column heading.
 */
const DEFAULT_USER_SORT: UserSort = 'status';

/** What an account needs, as a number to sort by. */
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

@Component({
  selector: 'app-user-list-page',
  imports: [
    RouterLink,
    Button,
    AdminIcon,
    AdminListHeader,
    AdminGrid,
    GridRowTemplate,
    GridCardTemplate,
    GridTimestamp,
    Skeleton,
    StatusBadge,
    UserRowActions,
  ],
  template: `
    <app-admin-list-header
      [title]="title()"
      [query]="query() ?? ''"
      [searchLabel]="text.searchLabel"
      [searchPlaceholder]="text.searchPlaceholder"
      [clearSearchLabel]="text.clearSearch"
      [filtered]="filtered()"
      [narrowBelow]="narrowBelow"
    >
      <a
        appButton
        class="gap-2"
        [routerLink]="isStaff() ? '/admin/users/staff/new' : '/admin/users/new'"
        [queryParams]="editorFrom()"
      >
        <app-admin-icon name="plus" class="h-4 w-4" />
        {{ isStaff() ? text.addStaff : text.addCustomer }}
      </a>
    </app-admin-list-header>

    <!-- Where a decline that raced with another change reports itself: every
         other action is a navigation, and reports from the editor. -->
    @if (pageError()) {
      <p class="mb-4 text-sm text-red-700" role="alert">{{ pageError() }}</p>
    }

    @if (users.error()) {
      <p class="text-muted" role="alert">{{ text.loadError }}</p>
    } @else if (rows(); as data) {
      <app-admin-grid
        [gridId]="gridId()"
        [columns]="columns()"
        [rows]="data"
        [trackBy]="byId"
        [sort]="sortKey()"
        [defaultSort]="defaultSort"
        [muted]="isClosed"
        [busy]="users.isLoading()"
        [filtered]="filtered()"
        [narrowBelow]="narrowBelow"
        [emptyMessage]="filtered() ? text.noResults : text.empty"
      >
        <ng-template appGridRow [of]="data" let-user>
          <!-- Who to call, and underneath the address to write to — the same
               pair the order list draws in one cell, for the same reason: two
               columns of the same person cost a third of the table. -->
          <td class="truncate" [title]="user.email">
            <span class="block truncate font-medium text-stone-700">
              {{ name(user) }}
            </span>
            <span class="block truncate text-xs text-subtle">
              {{ user.email }}
            </span>
          </td>
          <td class="truncate text-subtle" [title]="phone(user)">
            {{ phone(user) || dash }}
          </td>
          @if (isCustomers()) {
            <td
              class="truncate font-mono text-xs text-subtle"
              [title]="user.companyRegistrationId"
            >
              {{ user.companyRegistrationId || dash }}
            </td>
          }
          @if (isStaff()) {
            <td class="text-subtle">{{ roleLabel(user.role) }}</td>
          }
          @if (isCustomers()) {
            <td class="truncate text-subtle">
              {{ tierName(user.tierId) }}
            </td>
          }
          <td data-keep>
            <span appStatusBadge [tone]="statusTone(user.status)">{{
              statusLabel(user.status)
            }}</span>
          </td>
          <td class="text-subtle">
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

        <!-- The same account on a phone: who it is and whether it can sign in
             on the first line, then the two ways to reach them, then what
             prices they get — the tier is why a manager opens this list, and it
             is invisible to the customer themselves. -->
        <ng-template appGridCard [of]="data" let-user>
          <!-- Only the account is greyed once it is closed, never the badge
               that says so — the same rule the table follows cell by cell. -->
          <div class="flex items-baseline justify-between gap-3">
            <span
              class="truncate font-medium text-stone-700"
              [class.opacity-50]="isClosed(user)"
            >
              {{ name(user) }}
            </span>
            <span appStatusBadge [tone]="statusTone(user.status)">{{
              statusLabel(user.status)
            }}</span>
          </div>
          <div [class.opacity-50]="isClosed(user)">
            <p class="mt-1 truncate text-sm text-subtle">{{ user.email }}</p>
            @if (phone(user)) {
              <p class="truncate text-sm text-subtle">{{ phone(user) }}</p>
            }
          </div>
          <div class="mt-1 flex items-center justify-between gap-3">
            <span
              class="flex min-w-0 items-baseline gap-1 text-sm text-subtle"
              [class.opacity-50]="isClosed(user)"
            >
              <span class="truncate">
                {{ isStaff() ? roleLabel(user.role) : tierName(user.tierId) }} ·
              </span>
              <app-grid-timestamp [value]="user.createdAt" inline />
            </span>
            <app-user-row-actions
              class="shrink-0"
              [user]="user"
              [returnParams]="editorFrom()"
              (declined)="decline($event)"
              (activeChanged)="setActive($event.user, $event.active)"
            />
          </div>
        </ng-template>
      </app-admin-grid>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }
  `,
})
export class UserListPage {
  private readonly service = inject(StaffUsersService);
  private readonly tiers = inject(TiersService);
  protected readonly text = inject(ADMIN_TEXT).userList;
  protected readonly defaultSort = DEFAULT_USER_SORT;
  protected readonly dash = '—';

  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
  private readonly collator = new Intl.Collator(this.locale, {
    sensitivity: 'base',
  });

  /** Which side of the list this route shows, from its route `data`. */
  readonly kind = input<UserKind>('customer');
  protected readonly isCustomers = computed(() => this.kind() === 'customer');
  protected readonly isStaff = computed(() => this.kind() === 'staff');
  protected readonly title = computed(() =>
    this.isStaff() ? this.text.titleStaff : this.text.titleCustomers,
  );

  /*
   * Grid state, bound from query parameters — the inputs are named for the
   * parameters, since router input binding matches on the parameter's name.
   * Each is narrowed before it reaches the API, so a hand-edited URL falls back
   * to the default instead of a request the server would reject.
   */
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

  /** `default` (the base price list) and any tier id pass straight through; an
   * unknown id is a uuid the API answers with an empty page. */
  readonly tier = input('');
  protected readonly tierId = computed(() => this.tier() || undefined);

  /** A configured format's key. An unknown one matches nothing, which is the
   * honest answer for a shape this deployment does not have. */
  readonly companyIdFormat = input('');
  protected readonly companyIdFormatKey = computed(
    () => this.companyIdFormat() || undefined,
  );

  readonly sort = input('');
  protected readonly sortKey = computed(() => resolveUserSort(this.sort()));

  /** Whether anything is narrowing the list — what separates "no accounts" from
   * "no matches". */
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

  /** Held across reloads, so filtering or typing swaps the rows instead of
   * blanking the table while the next result is in flight. */
  private readonly shown = stableValue(this.users);

  /** The rows as displayed: sorted client-side, so changing the sort never
   * re-fetches. A copy — `sort` mutates, and the resource's array is shared. */
  protected readonly rows = computed<StaffUser[] | undefined>(() => {
    const data = this.shown();
    return data ? [...data].sort(this.comparator()) : undefined;
  });

  protected readonly showSkeleton = delayedLoading(this.users.isLoading);

  // --- Tiers (for the filter options and the tier column) ----------------

  private readonly tierList = resource({ loader: () => this.tiers.list() });
  private readonly tierNames = computed(
    () =>
      new Map((this.tierList.value()?.tiers ?? []).map((t) => [t.id, t.label])),
  );

  protected readonly tierOptions = computed<GridFilterOption[]>(() => [
    { value: '', label: this.text.tierAll },
    { value: 'default', label: this.baseTierLabel },
    ...(this.tierList.value()?.tiers ?? []).map((t) => ({
      value: t.id,
      label: t.label,
    })),
  ]);

  /**
   * The columns, declared once for the headings, the phone's filter sheet and
   * the widths an admin drags. Two lists share this component, so the set
   * differs by kind — and each kind's widths are remembered under its own id,
   * since a column that only customers have has no width on the staff list.
   */
  protected readonly gridId = computed(() => `users-${this.kind()}`);

  protected readonly columns = computed<GridColumn[]>(() => [
    {
      key: 'name',
      label: this.text.name,
      sort: { asc: 'name', desc: 'name_desc' },
      minWidth: 180,
    },
    { key: 'phone', label: this.text.phone, minWidth: 110 },
    // The heading itself, as with role/tier/status: its "all" option is what
    // names the column. A plain label only where the deployment configures no
    // formats, since then there is nothing to name.
    ...(this.isCustomers()
      ? [
          {
            key: 'companyId',
            label: this.text.companyId,
            minWidth: 100,
            ...(this.hasCompanyIdFormats
              ? {
                  filter: {
                    param: 'companyIdFormat',
                    options: this.companyIdFormatOptions,
                    value: this.companyIdFormat(),
                    ariaLabel: this.text.filterCompanyIdFormat,
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
              ariaLabel: this.text.filterRole,
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
              ariaLabel: this.text.filterTier,
            },
          } satisfies GridColumn,
        ]
      : []),
    {
      key: 'status',
      label: this.text.statusAll,
      sortName: this.text.status,
      minWidth: 110,
      // Both a filter and a sort: what the list is narrowed by is also what a
      // manager wants at the top when they open it.
      sort: { asc: 'status', desc: 'status_desc' },
      filter: {
        param: 'status',
        options: this.statusOptions,
        value: this.statusParam(),
        ariaLabel: this.text.filterStatus,
      },
    },
    {
      key: 'registered',
      label: this.text.registered,
      sort: { asc: 'registered', desc: 'registered_desc', descFirst: true },
      minWidth: 110,
    },
    // Two or three glyphs need what they need: a share of the table is the
    // wrong way to describe a column of buttons.
    // Two glyphs at 24px, with the gap and the cell's own padding.
    {
      key: 'actions',
      srLabel: this.text.actions,
      align: 'right',
      fixedWidth: 64,
    },
  ]);

  /**
   * Even with the email folded into the name, this list carries a phone number,
   * a registration number, a tier and a status beside it — seven columns that
   * are readable on a laptop and a wall of truncation on a tablet. So it gives
   * up on columns a whole breakpoint before the others do.
   */
  protected readonly narrowBelow = 'lg' as const;

  protected readonly byId = (user: StaffUser): string => user.id;

  /** An account that is over — switched off, or closed and anonymised. Greyed
   * like a deleted product; a pending one is not, because it is work. */
  protected readonly isClosed = (user: StaffUser): boolean =>
    user.status === 'disabled' || user.status === 'anonymized';

  protected readonly statusOptions: GridFilterOption[] = [
    { value: '', label: this.text.statusAll },
    { value: 'pending', label: this.text.statusPending },
    { value: 'invited', label: this.text.statusInvited },
    { value: 'active', label: this.text.statusActive },
    { value: 'disabled', label: this.text.statusDisabled },
    { value: 'anonymized', label: this.text.statusAnonymized },
  ];

  /**
   * The deployment's own shapes of registration number, named as it names them,
   * plus the one thing no format describes: an account with no number at all.
   * That option is why a single-format deployment gets the filter too — "which
   * of these customers is a private person" is a real question either way.
   */
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

  /** Staff are admin or manager only — the customer role is not a choice here. */
  protected readonly staffRoleOptions: GridFilterOption[] = [
    { value: '', label: this.text.roleAll },
    { value: 'admin', label: this.text.roleAdmin },
    { value: 'manager', label: this.text.roleManager },
  ];

  /** The base price list's name is deployment wording, not a stored tier — the
   * same label the tier list gives its uneditable first row. */
  private readonly baseTierLabel = inject(ADMIN_TEXT).tierList.defaultLabel;

  // --- Row actions -------------------------------------------------------

  private readonly confirm = inject(ConfirmService);
  protected readonly common = inject(ADMIN_TEXT).common;
  /** So an editor opened from here returns to this list, filters and all. */
  protected readonly editorFrom = injectEditorReturnParams();

  /** For the one action that is not a navigation: a declined row that raced. */
  protected readonly pageError = signal<string | null>(null);

  /**
   * Switch an account off or back on. Both directions are confirmed, because
   * neither is only a flag: switching off ends the person's session mid-work
   * and retires their password, and switching back on mails them a link. No
   * data is destroyed either way, and the wording says so.
   */
  protected async setActive(user: StaffUser, active: boolean): Promise<void> {
    this.pageError.set(null);
    const off = !active;
    const ok = await this.confirm.ask({
      heading: off ? this.text.deactivateTitle : this.text.reactivateTitle,
      message: (off
        ? this.text.deactivateConfirm
        : this.text.reactivateConfirm
      ).replace('{name}', this.name(user)),
      confirmLabel: off ? this.text.deactivate : this.text.reactivate,
      cancelLabel: this.common.cancel,
      confirmVariant: off ? 'danger' : 'primary',
    });
    if (!ok) return;

    try {
      const result = await this.service.setActive(user.id, active);
      if (!result.ok) this.pageError.set(this.text.errors[result.code]);
    } catch {
      this.pageError.set(this.text.saveError);
    }
    this.users.reload();
  }

  /** Decline a pending registration — a yes/no, so the shared confirm dialog.
   * On the rare race (already approved) the reload corrects the row and the
   * refusal shows in the page banner. */
  protected async decline(user: StaffUser): Promise<void> {
    this.pageError.set(null);
    const ok = await this.confirm.ask({
      heading: this.text.declineTitle,
      message: this.text.declineConfirm.replace('{name}', this.name(user)),
      confirmLabel: this.text.decline,
      cancelLabel: this.common.cancel,
      confirmVariant: 'danger',
    });
    if (!ok) return;

    try {
      const result = await this.service.remove(user.id);
      if (!result.ok) this.pageError.set(this.text.errors[result.code]);
    } catch {
      this.pageError.set(this.text.saveError);
    }
    this.users.reload();
  }

  // --- Rendering helpers -------------------------------------------------

  private nameKey(user: StaffUser): string {
    const full = `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim();
    return (full || user.email).toLowerCase();
  }

  protected name(user: StaffUser): string {
    const parts = [user.lastName, user.firstName].filter(Boolean);
    return parts.length ? parts.join(', ') : this.dash;
  }

  /** Stored as bare digits; the column reads it with this deployment's grouping. */
  protected phone(user: StaffUser): string {
    return formatPhone(user.phone, this.phoneInput);
  }

  protected tierName(tierId: string | null): string {
    return tierId
      ? (this.tierNames().get(tierId) ?? this.dash)
      : this.baseTierLabel;
  }

  protected roleLabel(role: StaffUser['role']): string {
    return {
      admin: this.text.roleAdmin,
      manager: this.text.roleManager,
      user: this.text.roleUser,
    }[role];
  }

  protected typeLabel(type: StaffUser['customerType']): string {
    if (!type) return this.dash;
    return type === 'company' ? this.text.typeCompany : this.text.typePerson;
  }

  protected statusLabel(status: StaffUser['status']): string {
    return {
      pending: this.text.statusPending,
      invited: this.text.statusInvited,
      active: this.text.statusActive,
      disabled: this.text.statusDisabled,
      anonymized: this.text.statusAnonymized,
    }[status];
  }

  /** The shared palette; see user-status.ts. */
  protected readonly statusTone = userStatusTone;

  private comparator(): (a: StaffUser, b: StaffUser) => number {
    switch (this.sortKey()) {
      case 'name':
        return (a, b) =>
          this.collator.compare(this.nameKey(a), this.nameKey(b));
      case 'name_desc':
        return (a, b) =>
          this.collator.compare(this.nameKey(b), this.nameKey(a));
      case 'type':
        return (a, b) => typeRank(a.customerType) - typeRank(b.customerType);
      case 'type_desc':
        return (a, b) => typeRank(b.customerType) - typeRank(a.customerType);
      case 'registered':
        return (a, b) => a.createdAt.localeCompare(b.createdAt);
      case 'registered_desc':
        return (a, b) => b.createdAt.localeCompare(a.createdAt);
      // Newest first inside each group: two registrations waiting since
      // different days are not equally old news.
      case 'status':
        return (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          b.createdAt.localeCompare(a.createdAt);
      case 'status_desc':
        return (a, b) =>
          STATUS_RANK[b.status] - STATUS_RANK[a.status] ||
          b.createdAt.localeCompare(a.createdAt);
    }
  }

  constructor() {
    usePageSeo({ name: () => this.title() });
  }
}
