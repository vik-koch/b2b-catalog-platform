import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ConsentRecord } from '@b2b-catalog-platform/shared/admin/accounts';
import { CustomerTier } from '@b2b-catalog-platform/shared/admin/catalog';
import {
  formatPersonName,
  StaffUser,
} from '@b2b-catalog-platform/shared/core/accounts';
import {
  fillText,
  normalizePhone,
} from '@b2b-catalog-platform/shared/platform';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Card } from '@b2b-catalog-platform/ui/content/card';
import { FACT_LIST } from '@b2b-catalog-platform/ui/content/fact-list';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { SectionTitle } from '@b2b-catalog-platform/ui/content/section-title';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { arrowLeftIcon } from '@b2b-catalog-platform/ui/icons/glyphs/arrow-left';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import {
  confirmRequest,
  ConfirmService,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';

import { ACCOUNTS_CONFIG } from '../../../core/accounts/accounts-config';
import { SHARED_ACCOUNTS_TEXT } from '../../../core/accounts/accounts-text';
import { SITE_CONFIG } from '../../../core/site/site-config';
import { AuthService } from '../../../platform/auth/auth.service';
import { ADMIN_TEXT } from '../../../platform/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { formatPhone } from '../../../platform/contact-fields';
import { delayedLoading } from '../../../platform/delayed-loading';
import { injectEditorReturnParams } from '../../../platform/edit-mode/editor-return';
import { usePageSeo } from '../../../platform/page-seo';
import { ADMIN_CATALOG_TEXT } from '../../catalog/catalog-text';
import { TiersService } from '../../catalog/tiers/tiers.service';
import { OwnershipService } from '../../platform/ownership/ownership.service';
import { LockedNote } from '../../platform/ownership/ui/locked-note';
import { ADMIN_ACCOUNTS_TEXT } from '../accounts-text';
import { ConsentRecordList } from '../consents/consent-record-list';
import {
  baseTierName,
  userRoleLabel,
  userStatusLabel,
  userStatusTone,
} from './user-status';
import { StaffUsersService } from './users.service';

/**
 * One account, read rather than edited: the customer's own page seen from the
 * other side, plus the tier and the source key they never see. It never bars
 * the way to the editor; ownership only hides the button and says why.
 */
@Component({
  selector: 'app-user-detail-page',
  imports: [
    FACT_LIST,
    SectionTitle,
    Card,
    RouterLink,
    Icon,
    Button,
    ConsentRecordList,
    LockedNote,
    Skeleton,
    StatusBadge,
    PageTitle,
    ErrorText,
  ],
  template: `
    <div class="max-w-3xl">
      @if (account.error()) {
        <p class="text-ink-subtle" role="alert">{{ text.loadError }}</p>
      } @else if (user(); as person) {
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 uiPageTitle>{{ name() }}</h1>
          <span uiStatusBadge [tone]="statusTone(person.status)">{{
            statusLabel(person.status)
          }}</span>
        </div>

        <div class="mt-7 flex flex-col gap-7">
          <section>
            <h2 uiSectionTitle class="mb-1.5">{{ text.detailsHeading }}</h2>
            <div uiCard>
              <dl uiFactList class="mt-2 text-sm">
                @for (row of details(); track row.label) {
                  <dt uiFactTerm>{{ row.label }}</dt>
                  <dd uiFactValue>{{ row.value }}</dd>
                }
              </dl>
            </div>
          </section>

          <section>
            <h2 uiSectionTitle class="mb-1.5">{{ text.accountHeading }}</h2>
            <div uiCard>
              <dl uiFactList class="mt-2 text-sm">
                @for (row of accountRows(); track row.label) {
                  <dt uiFactTerm>{{ row.label }}</dt>
                  <dd uiFactValue>{{ row.value }}</dd>
                }
              </dl>
            </div>
          </section>

          @if (asksCode()) {
            <section>
              <h2 uiSectionTitle class="mb-1.5">{{ text.signInHeading }}</h2>
              <div uiCard>
                <dl uiFactList class="mt-2 text-sm">
                  @for (row of signInRows(); track row.label) {
                    <dt uiFactTerm>{{ row.label }}</dt>
                    <dd uiFactValue>{{ row.value }}</dd>
                  }
                </dl>
                @if (canExempt()) {
                  <button
                    type="button"
                    uiButton
                    variant="secondary"
                    class="mt-4"
                    [disabled]="exempting()"
                    (click)="toggleExemption(person)"
                  >
                    {{ isExempt() ? text.unexempt : text.exempt }}
                  </button>
                }
                @if (exemptError(); as error) {
                  <p uiErrorText class="mt-3" role="alert">
                    {{ error }}
                  </p>
                }
              </div>
            </section>
          }

          <!-- Empty is said only while a consent is asked; otherwise it would
               read as something missing. -->
          @if (showsConsents()) {
            <section>
              <h2 uiSectionTitle class="mb-1.5">{{ text.consentsHeading }}</h2>
              @if (consentRecords().length > 0) {
                <app-consent-record-list
                  [records]="consentRecords()"
                  [showAccount]="false"
                />
              } @else {
                <p class="text-sm text-ink-subtle">{{ text.consentsEmpty }}</p>
              }
            </section>
          }
        </div>

        <!-- A missing button teaches nobody why: the banner says it. -->
        @if (locked()) {
          <app-locked-note class="mt-7">{{
            ownershipText.accountLocked
          }}</app-locked-note>
        }

        <div class="mt-7 flex flex-wrap gap-3">
          @if (canEdit()) {
            <a
              uiButton
              class="gap-2"
              [routerLink]="['/admin/users', person.id, 'edit']"
              [queryParams]="editorFrom()"
            >
              <ui-icon
                [glyph]="isPending() ? circleCheckIcon : pencilIcon"
                class="size-4"
              />
              {{ isPending() ? listText.approve : listText.edit }}
            </a>
          }
          <a
            uiButton
            variant="secondary"
            class="gap-2"
            [routerLink]="listUrl()"
          >
            <ui-icon [glyph]="arrowLeftIcon" class="size-4" />
            {{ text.back }}
          </a>
          <!-- Set apart: it cannot be taken back. -->
          @if (canDelete()) {
            <button
              type="button"
              uiButton
              variant="dangerOutline"
              class="gap-2 sm:ml-auto"
              [disabled]="deleting()"
              (click)="deleteOnRequest(person)"
            >
              <ui-icon [glyph]="trash2Icon" class="size-4" />
              {{ text.delete }}
            </button>
          }
        </div>
        @if (deleteError(); as error) {
          <p uiErrorText class="mt-3" role="alert">{{ error }}</p>
        }
      } @else if (notFound()) {
        <p class="text-ink-subtle" role="alert">{{ text.notFound }}</p>
      } @else if (showSkeleton()) {
        <ui-skeleton [lines]="6" />
      }
    </div>
  `,
})
export class UserDetailPage {
  protected readonly arrowLeftIcon = arrowLeftIcon;
  protected readonly circleCheckIcon = circleCheckIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly trash2Icon = trash2Icon;

  private readonly service = inject(StaffUsersService);
  private readonly tiers = inject(TiersService);
  private readonly auth = inject(AuthService);
  private readonly ownership = inject(OwnershipService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly accountsConfig = inject(ACCOUNTS_CONFIG);
  private readonly siteConfig = inject(SITE_CONFIG);
  private readonly confirm = inject(ConfirmService);

  protected readonly text = inject(ADMIN_ACCOUNTS_TEXT).users.detail;
  protected readonly listText = inject(ADMIN_ACCOUNTS_TEXT).users.list;
  protected readonly editorText = inject(ADMIN_ACCOUNTS_TEXT).users.editor;
  private readonly sharedText = inject(SHARED_TEXT);
  private readonly partyKind = inject(SHARED_ACCOUNTS_TEXT).partyKind;
  private readonly adminText = inject(ADMIN_TEXT);
  private readonly adminCatalogText = inject(ADMIN_CATALOG_TEXT);
  protected readonly ownershipText = inject(ADMIN_ACCOUNTS_TEXT).ownership;
  private readonly actionText = inject(SHARED_TEXT).actions;

  private readonly phoneInput = this.config.phoneInput;
  private readonly dateFormat = new Intl.DateTimeFormat(this.config.locale, {
    dateStyle: 'long',
  });

  /** From the route. */
  readonly id = input.required<string>();

  /** A 404 becomes `null`: `undefined` would read as still loading. */
  protected readonly account = resource({
    params: () => ({ id: this.id() }),
    loader: async ({ params }) => (await this.service.get(params.id)) ?? null,
  });
  protected readonly user = computed<StaffUser | undefined>(
    () => this.account.value() ?? undefined,
  );
  protected readonly notFound = computed(() => this.account.value() === null);
  protected readonly showSkeleton = delayedLoading(this.account.isLoading);

  /** A customer's, read by an admin. */
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
  private readonly consentAsked = Object.values(this.siteConfig.consent).some(
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

  /** Only a customer has a tier. */
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

  /** In flight counts as not owned: the API refuses the save anyway. */
  protected readonly locked = computed(
    () => this.isCustomer() && this.ownership.owns('customers'),
  );

  /** A closed account is a record; an owned one is edited elsewhere. */
  protected readonly canEdit = computed(
    () => !!this.user() && !this.isClosed() && !this.locked(),
  );

  /**
   * An admin's, never on their own account or an undecided registration
   * (that one is declined). Offered whatever owns the accounts: the person's
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

  /** Whether "they withdrew their consent" can be this account's reason. */
  private readonly accountConsentAsked = computed(
    () =>
      this.siteConfig.consent.account ||
      this.consentRecords().some((record) => record.purpose === 'account'),
  );

  private readonly stepConfig = this.accountsConfig.signInStep;

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

  /** An exemption counts only while the role may be exempted. */
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

  protected readonly canExempt = computed(
    () =>
      this.exemptable() &&
      this.auth.user()?.role === 'admin' &&
      !this.isClosed(),
  );
  protected readonly exempting = signal(false);
  protected readonly exemptError = signal<string | null>(null);

  protected readonly signInRows = computed(() => {
    const person = this.user();
    if (!person || !this.asksCode()) return [];
    const text = this.text;
    const exemptAt = person.signInStepExemptAt;
    return [
      {
        label: text.signInPhone,
        // Without a number that takes a code, the holder is locked out until
        // staff enter one.
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
    const dialog = exempt ? this.text.exemptConfirm : this.text.unexemptConfirm;
    const confirmed = await this.confirm.ask({
      ...confirmRequest(dialog, this.actionText.cancel),
      message: fillText(dialog.message, { name: this.name() }),
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

  /** As in the editor. */
  private readonly showsSourceId = computed(
    () => this.isCustomer() && this.auth.user()?.role === 'admin',
  );

  /** The editor returns here, carrying the list's filters on. */
  protected readonly editorFrom = injectEditorReturnParams();

  protected readonly name = computed(() => {
    const person = this.user();
    if (!person) return '';
    return formatPersonName(person.firstName, person.lastName) || person.email;
  });

  protected readonly listUrl = computed(() =>
    this.isCustomer() ? '/admin/users' : '/admin/users/staff',
  );

  /** Only the rows this account has: a dash reads as missing, not absent. */
  protected readonly details = computed(() => {
    const person = this.user();
    if (!person) return [];
    const editor = this.editorText;
    const fields = this.sharedText.fields;
    const type = person.customerType ? this.partyKind[person.customerType] : '';

    return [
      { label: fields.email.label, value: person.email },
      {
        label: fields.phone.label,
        value: formatPhone(person.phone, this.phoneInput),
      },
      { label: editor.customerType, value: type },
      {
        label: fields.companyId.label,
        value: person.companyRegistrationId ?? '',
      },
      { label: fields.companyName.label, value: person.companyName ?? '' },
    ].filter((row) => row.value !== '');
  });

  /** Drawn whole, unlike the details: an empty state here is worth saying. */
  protected readonly accountRows = computed(() => {
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

  private tierName(tierId: string | null): string {
    const tiers = this.tierList.value();
    return tierId
      ? (tiers?.find((t) => t.id === tierId)?.label ?? '—')
      : baseTierName(this.adminCatalogText.tiers.defaultName, tiers);
  }

  private roleLabel(role: StaffUser['role']): string {
    return userRoleLabel(this.listText, role);
  }

  protected statusLabel(status: StaffUser['status']): string {
    return userStatusLabel(this.listText, status);
  }

  protected async deleteOnRequest(person: StaffUser): Promise<void> {
    this.deleteError.set(null);
    const answer = await this.confirm.askDetailed({
      heading: this.text.deleteConfirm.heading,
      message: fillText(this.text.deleteConfirm.message, { name: this.name() }),
      warning: this.text.deleteConfirm.warning,
      confirmLabel: this.text.deleteConfirm.confirm,
      cancelLabel: this.text.deleteConfirm.cancel ?? this.actionText.cancel,
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
      this.account.reload();
    } catch {
      this.deleteError.set(this.text.deleteError);
    } finally {
      this.deleting.set(false);
    }
  }

  protected readonly statusTone = userStatusTone;

  private date(iso: string): string {
    return this.dateFormat.format(new Date(iso));
  }

  constructor() {
    usePageSeo({
      name: () => this.name() || this.listText.customersPage.title,
    });
    // Early, so the banner does not appear a beat after the page.
    void this.ownership.load();
  }
}
