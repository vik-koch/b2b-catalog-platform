import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  StaffUser,
  UserKind,
  userRoleSchema,
  userStatusSchema,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { AuthService } from '../../auth/auth.service';
import { usePageSeo } from '../../core/page-seo';
import { delayedLoading } from '../../core/delayed-loading';
import { stableValue } from '../../core/stable-value';
import { Skeleton } from '../../ui/skeleton';
import {
  GridFilterOption,
  GridFilterSelect,
} from '../products/grid-filter-select';
import { GridSearchField } from '../products/grid-search-field';
import { GridSortHeader } from '../products/grid-sort-header';
import { TiersService } from '../tiers/tiers.service';
import { StaffUsersService } from './users.service';

/**
 * The staff account list (FR-AUTH-03/04). One component, two views chosen by the
 * route's `kind`: **Customers** (the `user` role) and **Staff** (admin and
 * manager). The split is a permission boundary — a manager only ever reaches the
 * customer view, enforced by the API, not just by hiding a tab.
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
    RouterLinkActive,
    GridSearchField,
    GridSortHeader,
    GridFilterSelect,
    Skeleton,
  ],
  template: `
    <div class="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <h1 class="text-3xl font-bold tracking-tight">{{ text.title }}</h1>
      <app-grid-search-field
        [query]="query() ?? ''"
        [searchLabel]="text.searchLabel"
        [searchPlaceholder]="text.searchPlaceholder"
        [clearLabel]="text.clearSearch"
      />
      <!-- Reserved for the Add button (5b). -->
      <div></div>
    </div>

    <!-- Customers and Staff are two routes, not a filter, so the switch is
         navigation. The Staff view is admin-only, so its tab is absent for a
         manager rather than shown-then-refused. -->
    <nav class="mb-6 flex gap-6 border-b border-border text-sm">
      <a
        routerLink="/admin/users"
        routerLinkActive="border-primary text-stone-700"
        [routerLinkActiveOptions]="{ exact: true }"
        class="-mb-px border-b-2 border-transparent px-1 pb-2 text-subtle hover:text-accent"
        >{{ text.tabCustomers }}</a
      >
      @if (isAdmin()) {
        <a
          routerLink="/admin/users/staff"
          routerLinkActive="border-primary text-stone-700"
          class="-mb-px border-b-2 border-transparent px-1 pb-2 text-subtle hover:text-accent"
          >{{ text.tabStaff }}</a
        >
      }
    </nav>

    @if (users.error()) {
      <p class="text-muted" role="alert">{{ text.loadError }}</p>
    } @else if (rows(); as data) {
      <!-- The table renders even when empty: its header carries the filters that
           produced the empty result. table-fixed so a filter never reflows the
           columns. -->
      <div class="overflow-x-auto">
        <table
          class="w-full table-fixed text-sm text-left [&_th,&_td]:py-2 [&_th,&_td]:pr-4 [&_th:last-child,&_td:last-child]:pr-0"
          [attr.aria-busy]="users.isLoading() ? 'true' : null"
        >
          <thead>
            <tr class="border-b border-border text-subtle">
              <th class="w-44">
                <app-grid-sort
                  asc="name"
                  desc="name_desc"
                  [label]="text.name"
                  [sort]="sortKey()"
                  [defaultSort]="defaultSort"
                />
              </th>
              <th class="w-56">
                <app-grid-sort
                  asc="email"
                  desc="email_desc"
                  [label]="text.email"
                  [sort]="sortKey()"
                  [defaultSort]="defaultSort"
                />
              </th>
              <th class="w-36 font-medium">{{ text.phone }}</th>
              @if (isCustomers()) {
                <th class="w-24">
                  <app-grid-sort
                    asc="type"
                    desc="type_desc"
                    [label]="text.type"
                    [sort]="sortKey()"
                    [defaultSort]="defaultSort"
                  />
                </th>
                <th class="w-32 font-medium">{{ text.companyId }}</th>
              }
              @if (isStaff()) {
                <th class="w-32">
                  <app-grid-filter-select
                    param="role"
                    [options]="staffRoleOptions"
                    [value]="roleParam()"
                    [ariaLabel]="text.filterRole"
                  />
                </th>
              }
              @if (isCustomers()) {
                <th class="w-36">
                  <app-grid-filter-select
                    param="tier"
                    [options]="tierOptions()"
                    [value]="tier()"
                    [ariaLabel]="text.filterTier"
                  />
                </th>
              }
              <th class="w-28">
                <app-grid-filter-select
                  param="status"
                  [options]="statusOptions"
                  [value]="statusParam()"
                  [ariaLabel]="text.filterStatus"
                />
              </th>
              <th class="w-28">
                <app-grid-sort
                  asc="registered"
                  desc="registered_desc"
                  [label]="text.registered"
                  [descFirst]="true"
                  [sort]="sortKey()"
                  [defaultSort]="defaultSort"
                />
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
                <td class="truncate text-subtle" [title]="user.phone">
                  {{ user.phone || dash }}
                </td>
                @if (isCustomers()) {
                  <td class="text-subtle">
                    {{ typeLabel(user.customerType) }}
                  </td>
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
                  <span
                    class="rounded px-1.5 py-0.5 text-xs"
                    [class]="statusClass(user.status)"
                    >{{ statusLabel(user.status) }}</span
                  >
                </td>
                <td class="text-subtle">{{ formatDate(user.createdAt) }}</td>
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
  private readonly auth = inject(AuthService);
  protected readonly text = inject(ADMIN_TEXT).userList;
  protected readonly defaultSort = DEFAULT_USER_SORT;
  protected readonly dash = '—';

  private readonly locale = inject(DEPLOYMENT_CONFIG).catalog.currency.locale;
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
  protected readonly isAdmin = computed(
    () => this.auth.user()?.role === 'admin',
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

  readonly sort = input('');
  protected readonly sortKey = computed(() => resolveUserSort(this.sort()));

  /** Whether anything is narrowing the list — what separates "no accounts" from
   * "no matches". */
  protected readonly filtered = computed(
    () =>
      !!this.query() || !!this.statusKey() || !!this.roleKey() || !!this.tier(),
  );

  protected readonly users = resource({
    params: () => ({
      kind: this.kind(),
      status: this.statusKey(),
      role: this.roleKey(),
      tierId: this.tierId(),
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
    { value: 'anonymized', label: this.text.statusAnonymized },
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

  // --- Rendering helpers -------------------------------------------------

  private nameKey(user: StaffUser): string {
    const full = `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim();
    return (full || user.email).toLowerCase();
  }

  protected name(user: StaffUser): string {
    const parts = [user.lastName, user.firstName].filter(Boolean);
    return parts.length ? parts.join(', ') : this.dash;
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
      anonymized: this.text.statusAnonymized,
    }[status];
  }

  /** A muted badge per state: amber for waiting, blue for invited-not-yet-in,
   * green for active, grey for a closed account. */
  protected statusClass(status: StaffUser['status']): string {
    return {
      pending: 'bg-amber-100 text-amber-800',
      invited: 'bg-sky-100 text-sky-800',
      active: 'bg-green-100 text-green-800',
      anonymized: 'bg-stone-200 text-muted',
    }[status];
  }

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
    usePageSeo({ name: () => this.text.title });
  }
}
