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
import {
  GridFilterOption,
  GridFilterSelect,
} from '../products/grid-filter-select';
import { AdminListHeader } from '../list-header';
import { GridSortHeader } from '../products/grid-sort-header';
import { TiersService } from '../tiers/tiers.service';
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
  'email',
  'email_desc',
  'type',
  'type_desc',
  'registered',
  'registered_desc',
] as const;
type UserSort = (typeof USER_SORTS)[number];
const DEFAULT_USER_SORT: UserSort = 'registered_desc';

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
    GridSortHeader,
    GridFilterSelect,
    Skeleton,
    StatusBadge,
  ],
  template: `
    <app-admin-list-header
      [title]="title()"
      [query]="query() ?? ''"
      [searchLabel]="text.searchLabel"
      [searchPlaceholder]="text.searchPlaceholder"
      [clearSearchLabel]="text.clearSearch"
      [filtered]="filtered()"
    >
      <a
        appButton
        class="gap-2"
        [routerLink]="isStaff() ? '/admin/users/staff/new' : '/admin/users/new'"
        [queryParams]="editorFrom"
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
      <!-- The table renders even when empty: its header carries the filters that
           produced the empty result. table-fixed so a filter never reflows the
           columns — in percentages, because rem widths summed past the shell's
           content box and put a scrollbar under every screen size. -->
      <div class="overflow-x-auto">
        <table
          class="w-full table-fixed text-sm text-left [&_th,&_td]:py-2 [&_th,&_td]:pr-4 [&_th:last-child,&_td:last-child]:pr-0"
          [attr.aria-busy]="users.isLoading() ? 'true' : null"
        >
          <thead>
            <tr class="border-b border-border text-subtle">
              <th class="w-[18%]">
                <app-grid-sort
                  asc="name"
                  desc="name_desc"
                  [label]="text.name"
                  [sort]="sortKey()"
                  [defaultSort]="defaultSort"
                />
              </th>
              <th class="w-[20%]">
                <app-grid-sort
                  asc="email"
                  desc="email_desc"
                  [label]="text.email"
                  [sort]="sortKey()"
                  [defaultSort]="defaultSort"
                />
              </th>
              <th class="w-[13%] font-medium">{{ text.phone }}</th>
              @if (isCustomers()) {
                <!-- The heading itself, as with role/tier/status: its "all"
                     option is what names the column. A plain label only where
                     the deployment configures no formats, since then there is
                     nothing to name. -->
                @if (hasCompanyIdFormats) {
                  <th class="w-[11%]">
                    <app-grid-filter-select
                      param="companyIdFormat"
                      [options]="companyIdFormatOptions"
                      [value]="companyIdFormat()"
                      [ariaLabel]="text.filterCompanyIdFormat"
                    />
                  </th>
                } @else {
                  <th class="w-[11%] font-medium">{{ text.companyId }}</th>
                }
              }
              @if (isStaff()) {
                <th class="w-[19%]">
                  <app-grid-filter-select
                    param="role"
                    [options]="staffRoleOptions"
                    [value]="roleParam()"
                    [ariaLabel]="text.filterRole"
                  />
                </th>
              }
              @if (isCustomers()) {
                <th class="w-[12%]">
                  <app-grid-filter-select
                    param="tier"
                    [options]="tierOptions()"
                    [value]="tier()"
                    [ariaLabel]="text.filterTier"
                  />
                </th>
              }
              <th class="w-[10%]">
                <app-grid-filter-select
                  param="status"
                  [options]="statusOptions"
                  [value]="statusParam()"
                  [ariaLabel]="text.filterStatus"
                />
              </th>
              <th class="w-[10%]">
                <app-grid-sort
                  asc="registered"
                  desc="registered_desc"
                  [label]="text.registered"
                  [descFirst]="true"
                  [sort]="sortKey()"
                  [defaultSort]="defaultSort"
                />
              </th>
              <th class="w-[4%] text-right">
                <span class="sr-only">{{ text.actions }}</span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            @for (user of data; track user.id) {
              <tr>
                <td
                  class="truncate font-medium text-stone-700"
                  [title]="name(user)"
                >
                  {{ name(user) }}
                </td>
                <td class="truncate text-subtle" [title]="user.email">
                  {{ user.email }}
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
                <td>
                  <span appStatusBadge [tone]="statusTone(user.status)">{{
                    statusLabel(user.status)
                  }}</span>
                </td>
                <td class="text-subtle">{{ formatDate(user.createdAt) }}</td>
                <!-- Both actions open the same editor; only the glyph differs,
                     because on a pending row the job is a decision and not a
                     correction. The check carries the accent colour so that
                     intent reads at a glance down a column of grey pencils. -->
                <td>
                  <div class="flex items-center justify-end gap-1">
                    @if (user.status !== 'anonymized') {
                      <a
                        [routerLink]="['/admin/users', user.id, 'edit']"
                        [queryParams]="editorFrom"
                        class="p-1.5"
                        [class]="
                          user.status === 'pending'
                            ? 'text-accent hover:text-primary'
                            : 'text-subtle hover:text-accent'
                        "
                        [attr.aria-label]="
                          user.status === 'pending' ? text.approve : text.edit
                        "
                      >
                        <app-admin-icon
                          [name]="
                            user.status === 'pending'
                              ? 'circle-check'
                              : 'pencil'
                          "
                          class="h-4 w-4"
                        />
                      </a>
                    }
                    <!-- One slot for "stop this account", with the meaning the
                         row's state gives it: an undecided registration is
                         thrown away, an approved account is switched off
                         (whether or not its owner ever signed in), and a
                         switched-off one is switched back on. -->
                    @if (user.status === 'pending') {
                      <button
                        type="button"
                        class="p-1.5 text-subtle hover:text-red-700"
                        [attr.aria-label]="text.decline"
                        (click)="decline(user)"
                      >
                        <app-admin-icon name="trash-2" class="h-4 w-4" />
                      </button>
                    } @else if (user.status === 'disabled') {
                      <button
                        type="button"
                        class="p-1.5 text-subtle hover:text-accent"
                        [attr.aria-label]="text.reactivate"
                        (click)="setActive(user, true)"
                      >
                        <app-admin-icon name="rotate-ccw" class="h-4 w-4" />
                      </button>
                    } @else if (user.status !== 'anonymized') {
                      <button
                        type="button"
                        class="p-1.5 text-subtle hover:text-red-700"
                        [attr.aria-label]="text.deactivate"
                        (click)="setActive(user, false)"
                      >
                        <app-admin-icon name="circle-slash" class="h-4 w-4" />
                      </button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (data.length === 0) {
        <p class="mt-6 text-muted">
          {{ filtered() ? text.noResults : text.empty }}
        </p>
      }
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
  private readonly dateFormat = new Intl.DateTimeFormat(this.locale, {
    dateStyle: 'medium',
  });
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

  protected formatDate(iso: string): string {
    return this.dateFormat.format(new Date(iso));
  }

  private comparator(): (a: StaffUser, b: StaffUser) => number {
    switch (this.sortKey()) {
      case 'name':
        return (a, b) =>
          this.collator.compare(this.nameKey(a), this.nameKey(b));
      case 'name_desc':
        return (a, b) =>
          this.collator.compare(this.nameKey(b), this.nameKey(a));
      case 'email':
        return (a, b) => this.collator.compare(a.email, b.email);
      case 'email_desc':
        return (a, b) => this.collator.compare(b.email, a.email);
      case 'type':
        return (a, b) => typeRank(a.customerType) - typeRank(b.customerType);
      case 'type_desc':
        return (a, b) => typeRank(b.customerType) - typeRank(a.customerType);
      case 'registered':
        return (a, b) => a.createdAt.localeCompare(b.createdAt);
      case 'registered_desc':
        return (a, b) => b.createdAt.localeCompare(a.createdAt);
    }
  }

  constructor() {
    usePageSeo({ name: () => this.title() });
  }
}
