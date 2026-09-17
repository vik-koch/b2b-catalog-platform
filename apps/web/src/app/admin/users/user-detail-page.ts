import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CustomerTier,
  formatPersonName,
  StaffUser,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { AuthService } from '../../auth/auth.service';
import { formatPhone } from '../../core/contact-fields';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Skeleton } from '../../ui/skeleton';
import { StatusBadge } from '../../ui/status-badge';
import { injectEditorReturnParams } from '../editor-return';
import { SettingsService } from '../settings/settings.service';
import { TiersService } from '../tiers/tiers.service';
import { StaffUsersService } from './users.service';
import { userStatusTone } from './user-status';

/** One line of a details list: a label, and the value under it. */
interface DetailRow {
  readonly label: string;
  readonly value: string;
}

/**
 * One account, read rather than edited — `/admin/users/:id`, for customers and
 * staff alike.
 *
 * It is the customer's own account page seen from the other side: the same
 * facts in the same order, plus the two they are deliberately never shown —
 * the price list they are on (ADR 0031) and the key an exchange addresses them
 * by (FR-ADM-14). Most of what staff do with an account is look something up,
 * and until now the only way to read one was to open the form that changes it.
 *
 * It does **not** stand in front of the editor. `/:id/edit` is reachable as it
 * always was, including while an external system owns customer accounts, and
 * this page never redirects there or bars the way: it is a reading surface, not
 * a refusal screen. What ownership changes here is only whether the button that
 * leads to the editor is drawn, and a banner saying where the account is edited
 * instead.
 */
@Component({
  selector: 'app-user-detail-page',
  imports: [RouterLink, AdminIcon, Button, Skeleton, StatusBadge],
  template: `
    <!-- The account page's own width: a column of short cards, which at the
         full width of a desktop is a heading beside half a screen of nothing. -->
    <div class="max-w-3xl">
      @if (account.error()) {
        <p class="text-muted" role="alert">{{ text.loadError }}</p>
      } @else if (user(); as person) {
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 class="text-3xl font-medium tracking-tight">{{ name() }}</h1>
          <span appStatusBadge [tone]="statusTone(person.status)">{{
            statusLabel(person.status)
          }}</span>
        </div>

        <!-- The address is not repeated under the heading: it is the first
             labelled line of the card below, and twice on one screen is twice
             for anyone searching the page for it. -->
        <!-- One stack with one gap rather than a margin on every section: the
             space between two cards belongs to the list, not to each card. -->
        <div class="mt-7 flex flex-col gap-7">
          <section>
            <h2 [class]="headingClass">{{ text.detailsHeading }}</h2>
            <div class="rounded-lg border border-border p-5">
              <dl
                class="grid gap-x-8 mt-2 text-sm break-words sm:grid-cols-[12rem_1fr]"
              >
                @for (row of details(); track row.label) {
                  <dt class="text-muted odd:mb-1 sm:odd:mb-3 nth-last-[2]:mb-0">
                    {{ row.label }}
                  </dt>
                  <dd class="even:mb-3 sm:even:mb-3 last:mb-0">
                    {{ row.value }}
                  </dd>
                }
              </dl>
            </div>
          </section>

          <section>
            <h2 [class]="headingClass">{{ text.accountHeading }}</h2>
            <div class="rounded-lg border border-border p-5">
              <dl
                class="grid gap-x-8 mt-2 text-sm break-words sm:grid-cols-[12rem_1fr]"
              >
                @for (row of accountRows(); track row.label) {
                  <dt class="text-muted odd:mb-1 sm:odd:mb-3 nth-last-[2]:mb-0">
                    {{ row.label }}
                  </dt>
                  <dd class="even:mb-3 sm:even:mb-3 last:mb-0">
                    {{ row.value }}
                  </dd>
                }
              </dl>
            </div>
          </section>
        </div>

        <!-- The same banner the editor carries, and for the same reason: a
             button that quietly is not there teaches nobody why. -->
        @if (locked()) {
          <p
            class="mt-7 rounded-md bg-stone-100 px-4 py-2 text-sm text-muted"
            role="status"
          >
            {{ ownershipText.accountLocked }}
          </p>
        }

        <div class="mt-7 flex flex-wrap gap-3">
          <!-- Nothing to edit while the account is closed or owned elsewhere,
               so nothing is offered; the way back stays either way. -->
          @if (canEdit()) {
            <a
              appButton
              class="gap-2"
              [routerLink]="['/admin/users', person.id, 'edit']"
              [queryParams]="editorFrom()"
            >
              <app-admin-icon
                [name]="isPending() ? 'circle-check' : 'pencil'"
                class="h-4 w-4"
              />
              {{ isPending() ? listText.approve : listText.edit }}
            </a>
          }
          <a
            appButton
            variant="secondary"
            class="gap-2"
            [routerLink]="listUrl()"
          >
            <app-admin-icon name="arrow-left" class="h-4 w-4" />
            {{ text.back }}
          </a>
        </div>
      } @else if (notFound()) {
        <p class="text-muted" role="alert">{{ text.notFound }}</p>
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="6" />
      }
    </div>
  `,
})
export class UserDetailPage {
  /** One heading treatment written once, as the account page's is. */
  protected readonly headingClass =
    'mb-1.5 text-xs font-medium tracking-wide text-subtle uppercase';

  private readonly service = inject(StaffUsersService);
  private readonly tiers = inject(TiersService);
  private readonly auth = inject(AuthService);
  private readonly ownership = inject(SettingsService);
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(ADMIN_TEXT).userDetail;
  /** The same words the list and the editor use for the same things. */
  protected readonly listText = inject(ADMIN_TEXT).userList;
  protected readonly editorText = inject(ADMIN_TEXT).userEditor;
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;

  private readonly phoneInput = this.config.phoneInput;
  private readonly dateFormat = new Intl.DateTimeFormat(
    this.config.catalog.currency.locale,
    { dateStyle: 'long' },
  );

  /** From the route, by input binding. */
  readonly id = input.required<string>();

  /**
   * `null` rather than `undefined` for the API's 404 — unknown, or staff seen
   * by a manager, which it deliberately does not distinguish. A resource whose
   * value is `undefined` is one with no answer *yet*, so a 404 left as
   * `undefined` is indistinguishable from still loading.
   */
  protected readonly account = resource({
    params: () => ({ id: this.id() }),
    loader: async ({ params }) => (await this.service.get(params.id)) ?? null,
  });
  protected readonly user = computed<StaffUser | undefined>(
    () => this.account.value() ?? undefined,
  );
  protected readonly notFound = computed(() => this.account.value() === null);
  protected readonly showSkeleton = delayedLoading(this.account.isLoading);

  /** Only a customer has a tier, so only a customer's page asks for the list. */
  private readonly tierList = resource<CustomerTier[], { customer: boolean }>({
    params: () => ({ customer: this.isCustomer() }),
    loader: async ({ params }) =>
      params.customer ? (await this.tiers.list()).tiers : [],
  });

  protected readonly isCustomer = computed(() => this.user()?.role === 'user');
  protected readonly isPending = computed(
    () => this.user()?.status === 'pending',
  );
  private readonly isClosed = computed(
    () => this.user()?.status === 'anonymized',
  );

  /**
   * Whether an external system holds customer accounts (FR-ADM-10). Read on
   * the same terms the editor reads it: an answer still in flight counts as
   * not owned, and the API refuses the save either way. Staff accounts are
   * never locked by it.
   */
  protected readonly locked = computed(
    () => this.isCustomer() && this.ownership.owns('customers'),
  );

  /** A closed account is a record; an owned one is edited elsewhere. */
  protected readonly canEdit = computed(
    () => !!this.user() && !this.isClosed() && !this.locked(),
  );

  /** Only an admin sees the source key, exactly as in the editor. */
  private readonly showsSourceId = computed(
    () => this.isCustomer() && this.auth.user()?.role === 'admin',
  );

  /** So the editor opened from here comes back here, and this page's own
   * `?from=` carries the list's filters on through. */
  protected readonly editorFrom = injectEditorReturnParams();

  protected readonly name = computed(() => {
    const person = this.user();
    if (!person) return '';
    return formatPersonName(person.firstName, person.lastName) || person.email;
  });

  protected readonly listUrl = computed(() =>
    this.isCustomer() ? '/admin/users' : '/admin/users/staff',
  );

  /**
   * How to reach them and what they say they are. Only the lines this account
   * actually has: a staff account has no phone and a private person no
   * registration number, and a dash against every second label reads as
   * something missing rather than something absent.
   */
  protected readonly details = computed<DetailRow[]>(() => {
    const person = this.user();
    if (!person) return [];
    const editor = this.editorText;
    const type =
      person.customerType === 'company'
        ? this.listText.typeCompany
        : person.customerType === 'person'
          ? this.listText.typePerson
          : '';

    return [
      { label: editor.email, value: person.email },
      // Stored as bare digits; read back with the deployment's own grouping.
      {
        label: editor.phone,
        value: formatPhone(person.phone, this.phoneInput),
      },
      { label: editor.customerType, value: type },
      { label: editor.companyId, value: person.companyRegistrationId ?? '' },
      { label: editor.companyName, value: person.companyName ?? '' },
    ].filter((row) => row.value !== '');
  });

  /**
   * Where the account stands — and, unlike the details above, drawn whole:
   * every line here is a fact about the account itself, and one that is empty
   * (no tier of its own, no source key, not approved yet) is a state worth
   * saying rather than a row to drop.
   */
  protected readonly accountRows = computed<DetailRow[]>(() => {
    const person = this.user();
    if (!person) return [];
    const editor = this.editorText;

    return [
      ...(this.isCustomer()
        ? [{ label: editor.tier, value: this.tierName(person.tierId) }]
        : [{ label: editor.role, value: this.roleLabel(person.role) }]),
      ...(this.showsSourceId()
        ? [
            {
              label: editor.sourceId,
              value: person.sourceId ?? this.text.sourceIdEmpty,
            },
          ]
        : []),
      { label: this.listText.registered, value: this.date(person.createdAt) },
      {
        label: this.text.approved,
        value: person.approvedAt
          ? this.date(person.approvedAt)
          : this.text.approvedNever,
      },
    ];
  });

  /**
   * The storefront's own list under its own name, marked as the default: an
   * account with a null carries no choice anybody made, and the row should not
   * read as if one had been.
   */
  private tierName(tierId: string | null): string {
    const tiers = this.tierList.value() ?? [];
    if (tierId) {
      return tiers.find((t) => t.id === tierId)?.label ?? '—';
    }
    return this.common.tierDefault.replace(
      '{list}',
      tiers.find((t) => t.isDefault)?.label ?? '',
    );
  }

  protected roleLabel(role: StaffUser['role']): string {
    return {
      admin: this.listText.roleAdmin,
      manager: this.listText.roleManager,
      user: this.listText.roleUser,
    }[role];
  }

  protected statusLabel(status: StaffUser['status']): string {
    return {
      pending: this.listText.statusPending,
      invited: this.listText.statusInvited,
      active: this.listText.statusActive,
      disabled: this.listText.statusDisabled,
      anonymized: this.listText.statusAnonymized,
    }[status];
  }

  /** The shared palette; see user-status.ts. */
  protected readonly statusTone = userStatusTone;

  private date(iso: string): string {
    return this.dateFormat.format(new Date(iso));
  }

  constructor() {
    usePageSeo({ name: () => this.name() || this.listText.titleCustomers });
    // Asked for here rather than at the click: the answer is cached for the
    // app's lifetime, and the banner must not appear a beat after the page.
    void this.ownership.load();
  }
}
