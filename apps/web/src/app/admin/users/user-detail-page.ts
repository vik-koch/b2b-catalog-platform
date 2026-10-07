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
  ConsentRecord,
  CustomerTier,
  fillText,
  formatPersonName,
  normalizePhone,
  StaffUser,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { AuthService } from '../../auth/auth.service';
import { formatPhone } from '../../core/contact-fields';
import { delayedLoading } from '../../core/delayed-loading';
import { usePageSeo } from '../../core/page-seo';
import { LockedNote } from '../ownership/locked-note';
import { ConsentRecordList } from '../consents/consent-record-list';
import { Button } from '../../ui/button';
import { ConfirmService } from '../../ui/confirm.service';
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
  imports: [
    RouterLink,
    AdminIcon,
    Button,
    ConsentRecordList,
    LockedNote,
    Skeleton,
    StatusBadge,
  ],
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
                class="grid gap-x-8 mt-2 text-sm wrap-break-word sm:grid-cols-[12rem_1fr]"
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
                class="grid gap-x-8 mt-2 text-sm wrap-break-word sm:grid-cols-[12rem_1fr]"
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

          <!-- Only where the deployment asks this account's role for a code
               after the password (FR-AUTH-12). -->
          @if (asksCode()) {
            <section>
              <h2 [class]="headingClass">{{ text.signInHeading }}</h2>
              <div class="rounded-lg border border-border p-5">
                <dl
                  class="grid gap-x-8 mt-2 text-sm wrap-break-word sm:grid-cols-[12rem_1fr]"
                >
                  @for (row of signInRows(); track row.label) {
                    <dt
                      class="text-muted odd:mb-1 sm:odd:mb-3 nth-last-[2]:mb-0"
                    >
                      {{ row.label }}
                    </dt>
                    <dd class="even:mb-3 sm:even:mb-3 last:mb-0">
                      {{ row.value }}
                    </dd>
                  }
                </dl>
                @if (canExempt()) {
                  <button
                    type="button"
                    appButton
                    variant="secondary"
                    class="mt-4"
                    [disabled]="exempting()"
                    (click)="toggleExemption(person)"
                  >
                    {{ isExempt() ? text.unexempt : text.exempt }}
                  </button>
                }
                @if (exemptError(); as error) {
                  <p class="mt-3 text-sm text-red-700" role="alert">
                    {{ error }}
                  </p>
                }
              </div>
            </section>
          }

          <!-- A customer's only, since staff are never asked, and an admin's.
               Said when empty while a consent is asked: an account without a
               record is then what a question is about. Where none is asked, an
               empty card would read as something missing, so it is left out. -->
          @if (showsConsents()) {
            <section>
              <h2 [class]="headingClass">{{ text.consentsHeading }}</h2>
              @if (consentRecords().length > 0) {
                <app-consent-record-list
                  [records]="consentRecords()"
                  [showAccount]="false"
                />
              } @else {
                <p class="text-sm text-muted">{{ text.consentsEmpty }}</p>
              }
            </section>
          }
        </div>

        <!-- The same banner the editor carries, and for the same reason: a
             button that quietly is not there teaches nobody why. -->
        @if (locked()) {
          <app-locked-note class="mt-7">{{
            ownershipText.accountLocked
          }}</app-locked-note>
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
                class="size-4"
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
            <app-admin-icon name="arrow-left" class="size-4" />
            {{ text.back }}
          </a>
          <!-- Set apart from the two above: it cannot be taken back. -->
          @if (canDelete()) {
            <button
              type="button"
              appButton
              variant="dangerOutline"
              class="gap-2 sm:ml-auto"
              [disabled]="deleting()"
              (click)="deleteOnRequest(person)"
            >
              <app-admin-icon name="trash-2" class="size-4" />
              {{ text.delete }}
            </button>
          }
        </div>
        @if (deleteError(); as error) {
          <p class="mt-3 text-sm text-red-700" role="alert">{{ error }}</p>
        }
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
  private readonly confirm = inject(ConfirmService);

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

  /** The account's consent records: a customer's, read by an admin. */
  protected readonly consents = resource<
    ConsentRecord[],
    { id: string; reads: boolean }
  >({
    params: () => ({
      id: this.id(),
      reads: this.isCustomer() && this.auth.user()?.role === 'admin',
    }),
    loader: async ({ params }) =>
      params.reads ? this.service.listConsents(params.id) : [],
  });
  private readonly consentAsked = Object.values(this.config.consent).some(
    Boolean,
  );
  protected readonly consentRecords = computed(() =>
    this.consents.hasValue() ? this.consents.value() : [],
  );
  protected readonly showsConsents = computed(
    () =>
      this.isCustomer() &&
      this.auth.user()?.role === 'admin' &&
      this.consents.hasValue() &&
      (this.consentAsked || this.consentRecords().length > 0),
  );

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

  /**
   * Deleting on the person's request (FR-ADM-23): an admin's, never their own
   * account, and never a registration nobody has decided on — that one is
   * declined. Offered whatever owns customer accounts, since the person's
   * right outranks the switch.
   */
  protected readonly canDelete = computed(() => {
    const person = this.user();
    const me = this.auth.user();
    return (
      !!person &&
      me?.role === 'admin' &&
      person.id !== me.id &&
      person.status !== 'pending' &&
      person.status !== 'anonymized'
    );
  });
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  /**
   * Whether "they withdrew their consent" is a reason this account can have:
   * where the deployment asks the account consent, or a record of one exists.
   */
  private readonly accountConsentAsked = computed(
    () =>
      this.config.consent.account ||
      this.consentRecords().some((record) => record.purpose === 'account'),
  );

  /** The code after the password (FR-AUTH-12), as this deployment asks it. */
  private readonly stepConfig = this.config.signInStep;

  /** The deployment asks this account's role for a code after the password. */
  protected readonly asksCode = computed(() => {
    const person = this.user();
    const step = this.stepConfig;
    return (
      !!person &&
      !!step &&
      step.mode !== 'off' &&
      step.roles.includes(person.role)
    );
  });

  /** Whether an exemption on this account counts: only while the deployment
   * lets its role be exempted, as the API reads it. */
  private readonly exemptable = computed(() => {
    const person = this.user();
    return (
      this.asksCode() &&
      !!person &&
      (this.stepConfig?.exemptableRoles ?? []).includes(person.role)
    );
  });

  protected readonly isExempt = computed(
    () => this.exemptable() && !!this.user()?.signInStepExemptAt,
  );

  /** An admin's, on an account that is not closed. */
  protected readonly canExempt = computed(
    () =>
      this.exemptable() &&
      this.auth.user()?.role === 'admin' &&
      !this.isClosed(),
  );
  protected readonly exempting = signal(false);
  protected readonly exemptError = signal<string | null>(null);

  protected readonly signInRows = computed<DetailRow[]>(() => {
    const person = this.user();
    if (!person || !this.asksCode()) return [];
    const text = this.text;
    const exemptAt = person.signInStepExemptAt;
    return [
      {
        label: text.signInPhone,
        // A number staff set is what codes go to, and nobody can choose
        // another at sign-in: without one that takes a code, the holder is
        // locked out until it is entered here.
        value: !this.takesCode(person.phone)
          ? text.signInPhoneMissing
          : person.phoneConfirmedAt
            ? fillText(text.signInPhoneConfirmed, {
                date: this.date(person.phoneConfirmedAt),
              })
            : text.signInPhoneUnconfirmed,
      },
      {
        label: text.signInCode,
        value:
          this.isExempt() && exemptAt
            ? fillText(text.signInCodeExempt, {
                admin: person.signInStepExemptBy ?? '—',
                date: this.date(exemptAt),
              })
            : this.stepConfig?.mode === 'always'
              ? this.stepConfig.trustDeviceDays
                ? fillText(text.signInCodeAlwaysRemembered, {
                    days: String(this.stepConfig.trustDeviceDays),
                  })
                : text.signInCodeAlways
              : text.signInCodeOnce,
      },
    ];
  });

  /** Whether a code can be sent to this number as it is stored. */
  private takesCode(phone: string | null): boolean {
    return !!phone && normalizePhone(phone, this.phoneInput) === phone;
  }

  protected async toggleExemption(person: StaffUser): Promise<void> {
    this.exemptError.set(null);
    const exempt = !this.isExempt();
    const confirmed = await this.confirm.ask({
      heading: exempt ? this.text.exemptTitle : this.text.unexemptTitle,
      message: fillText(
        exempt ? this.text.exemptConfirm : this.text.unexemptConfirm,
        { name: this.name() },
      ),
      confirmLabel: exempt ? this.text.exempt : this.text.unexempt,
      cancelLabel: this.common.cancel,
    });
    if (!confirmed) return;

    this.exempting.set(true);
    try {
      const result = await this.service.setSignInStepExemption(
        person.id,
        exempt,
      );
      if (result.ok) {
        this.account.set(result.user);
        return;
      }
      this.exemptError.set(this.listText.errors[result.code]);
      this.account.reload();
    } catch {
      this.exemptError.set(this.text.exemptError);
    } finally {
      this.exempting.set(false);
    }
  }

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

  protected async deleteOnRequest(person: StaffUser): Promise<void> {
    this.deleteError.set(null);
    const answer = await this.confirm.askDetailed({
      heading: this.text.deleteTitle,
      message: fillText(this.text.deleteConfirm, { name: this.name() }),
      warning: this.text.deleteWarning,
      confirmLabel: this.text.delete,
      cancelLabel: this.common.cancel,
      confirmVariant: 'danger',
      checks: this.accountConsentAsked()
        ? [
            {
              key: 'consentWithdrawn',
              label: this.text.deleteConsentWithdrawn,
              hint: this.text.deleteConsentWithdrawnHint,
              checked: false,
            },
          ]
        : [],
    });
    if (!answer) return;

    this.deleting.set(true);
    try {
      const result = await this.service.deleteOnRequest(
        person.id,
        answer.checks['consentWithdrawn'] ? 'consent-withdrawn' : 'request',
      );
      if (result.ok) {
        this.account.set(result.user);
        this.consents.reload();
        return;
      }
      this.deleteError.set(this.listText.errors[result.code]);
      // Whatever changed under the page, show it as it now stands.
      this.account.reload();
    } catch {
      this.deleteError.set(this.text.deleteError);
    } finally {
      this.deleting.set(false);
    }
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
