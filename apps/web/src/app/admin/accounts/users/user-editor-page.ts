import { ACCOUNTS_CONFIG } from '../../../core/accounts/accounts-config';
import { ADMIN_ACCOUNTS_TEXT } from '../accounts-text';
import { Component, computed, inject, signal } from '@angular/core';
import { disabled, form, hidden, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomerTier } from '@b2b-catalog-platform/shared/admin/catalog';
import { ADMIN_TEXT } from '../../../platform/config/admin-text';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { SHARED_ACCOUNTS_TEXT } from '../../../core/accounts/accounts-text';
import { staffFields } from '../../platform/staff-fields';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { AuthService } from '../../../platform/auth/auth.service';
import { canonicalPhone, typedPhone } from '../../../platform/contact-fields';
import { delayedLoading } from '../../../platform/delayed-loading';
import { completeMask, emailAddress } from '../../../platform/field-rules';
import { companyIdFormat } from '../../../core/accounts/parties/company-id';
import { usePageSeo } from '../../../platform/page-seo';
import { UnsavedChangesAware } from '../../platform/unsaved-changes.guard';
import { UnsavedChanges } from '../../platform/unsaved-changes';
import { LockedNote } from '../../platform/ownership/ui/locked-note';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Notice } from '@b2b-catalog-platform/ui/content/notice';
import { CompanyFields } from '../../../core/accounts/parties/company-fields';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { submitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { PhoneInput } from '@b2b-catalog-platform/ui/inputs/phone-input';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { injectEditorReturn } from '../../../platform/edit-mode/editor-return';
import { OwnershipService } from '../../platform/ownership/ownership.service';
import { TiersService } from '../../catalog/tiers/tiers.service';
import { StaffUsersService } from './users.service';
import { SelectInput } from '@b2b-catalog-platform/ui/inputs/select-input';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { baseTierName, userStatusLabel, userStatusTone } from './user-status';
import {
  Segmented,
  SegmentOption,
} from '@b2b-catalog-platform/ui/choices/segmented';
import { WarningNote } from '@b2b-catalog-platform/ui/content/warning-note';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { saveIcon } from '@b2b-catalog-platform/ui/icons/glyphs/save';
import { sendIcon } from '@b2b-catalog-platform/ui/icons/glyphs/send';
import { SaveButton } from '../../platform/ui/save-button';
import { CancelButton } from '../../platform/ui/cancel-button';
import {
  CustomerType,
  StaffUser,
  UserKind,
} from '@b2b-catalog-platform/shared/core/accounts';
import { UserRole } from '@b2b-catalog-platform/shared/platform';
import { ADMIN_CATALOG_TEXT } from '../../catalog/catalog-text';

interface UserDraft {
  email: string;
  customerType: CustomerType;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  companyRegistrationId: string;
  /** `default` is the base price list; `''` only exists before an approval. */
  tierId: string;
  role: UserRole;
  /** Empty means the account carries none: every account nobody has claimed,
   * and a normal state. */
  sourceId: string;
}

/**
 * Adding, editing and approving an account: one screen, since all three ask
 * the same fields. Approval is a review, so a typo can be fixed in the same
 * breath. The email is never editable here: it is the sign-in name.
 */
@Component({
  selector: 'app-user-editor-page',
  imports: [
    CancelButton,
    SaveButton,
    FORM_FIELDS,
    LockedNote,
    Button,
    Icon,
    CompanyFields,
    Input,
    PhoneInput,
    Skeleton,
    SelectInput,
    StatusBadge,
    Segmented,
    WarningNote,
    PageTitle,
    ErrorText,
    Notice,
  ],
  template: `
    <div class="max-w-xl">
      <h1 uiPageTitle class="mb-4">{{ title() }}</h1>

      @if (loading()) {
        @if (showSkeleton()) {
          <ui-skeleton [lines]="5" />
        }
      } @else if (notFound()) {
        <p class="text-ink-subtle" role="alert">{{ text.notFound }}</p>
      } @else {
        @if (account(); as user) {
          <!-- Breaking, because an address is one word: the value track
               floors at its longest word, so an email nobody shortened widens
               the grid past the screen rather than wrapping inside it. -->
          <dl
            class="mb-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm
                   wrap-break-word"
          >
            <dt class="text-ink-subtle">{{ fields.email.label }}</dt>
            <dd class="font-medium text-ink">{{ user.email }}</dd>
            <dt class="text-ink-subtle">{{ listText.registered }}</dt>
            <dd class="text-ink-subtle">{{ registered() }}</dd>
            <dt class="text-ink-subtle">{{ text.status }}</dt>
            <dd>
              <span uiStatusBadge [tone]="statusTone(user.status)">{{
                statusLabel(user.status)
              }}</span>
            </dd>
          </dl>
        }

        @if (closed()) {
          <p uiNotice tone="neutral" class="mb-6">
            {{ text.closed }}
          </p>
        }

        <!-- One banner, not a lock per field: the whole area is closed. -->
        @if (locked()) {
          <app-locked-note class="mb-6">
            {{
              newAndLocked()
                ? ownershipText.accountCreate
                : ownershipText.accountLocked
            }}
          </app-locked-note>
        }

        @if (newAndLocked()) {
          <!-- Nothing to fill in; the way back stays. -->
          <button
            uiButton
            variant="secondary"
            appCancelButton
            type="button"
            (click)="cancel()"
          >
            {{ actionText.cancel }}
          </button>
        } @else {
          <form [formRoot]="form" (submit)="submit()" class="space-y-6">
            @if (isNew) {
              <ui-field
                [field]="form.email"
                [label]="fields.email.label"
                controlId="email"
              >
                <input
                  type="email"
                  autocomplete="off"
                  uiInput
                  class="w-full"
                  [formField]="form.email"
                />
              </ui-field>
            } @else {
              <p class="text-sm text-ink-subtle">{{ text.emailFixed }}</p>
            }

            @if (isCustomer()) {
              @if (typeLeftBehind()) {
                <ui-warning-note>{{ text.typeNotAccepted }}</ui-warning-note>
              }
              @if (customerTypes.length > 1) {
                <ui-field-group
                  [field]="form.customerType"
                  [label]="text.customerType"
                >
                  <ui-segmented
                    [options]="customerTypes"
                    size="md"
                    [formField]="form.customerType"
                  />
                </ui-field-group>
              }
            }

            <div class="grid gap-6 sm:grid-cols-2">
              <ui-field
                [field]="form.firstName"
                [label]="fields.firstName.label"
                controlId="firstName"
              >
                <input
                  type="text"
                  autocomplete="off"
                  uiInput
                  class="w-full"
                  [formField]="form.firstName"
                />
              </ui-field>

              <ui-field
                [field]="form.lastName"
                [label]="fields.lastName.label"
                controlId="lastName"
              >
                <input
                  type="text"
                  autocomplete="off"
                  uiInput
                  class="w-full"
                  [formField]="form.lastName"
                />
              </ui-field>
            </div>

            @if (isCompany()) {
              <app-company-fields
                idInputId="companyRegistrationId"
                [idField]="form.companyRegistrationId"
                [nameField]="form.companyName"
              />
            }

            <!-- Optional here: staff often start from an email alone. -->
            <ui-field
              [field]="form.phone"
              [label]="fields.phone.label"
              controlId="phone"
            >
              <ui-phone-input
                [field]="form.phone"
                [phone]="phoneInput"
                autocomplete="off"
              />
            </ui-field>

            @if (isCustomer()) {
              <ui-field
                [field]="form.tierId"
                [label]="text.tier"
                controlId="tier"
              >
                <ui-select-input class="w-full">
                  <select uiInput class="w-full" [formField]="form.tierId">
                    <!-- An approval must choose: no tier is a default. -->
                    @if (isApproval()) {
                      <option value="">{{ text.tierChoose }}</option>
                    }
                    <!-- The default list once, as "default": its accounts hold null. -->
                    <option value="default">{{ baseTierLabel() }}</option>
                    @for (tier of otherTiers(); track tier.id) {
                      <option [value]="tier.id">{{ tier.label }}</option>
                    }
                  </select>
                </ui-select-input>
              </ui-field>
            }

            <!-- Admin only: a manager could grant it to themselves. -->
            @if (showsRole()) {
              <ui-field
                [field]="form.role"
                [label]="text.role"
                controlId="role"
              >
                <ui-select-input class="w-full">
                  <select uiInput class="w-full" [formField]="form.role">
                    <option value="manager">{{ listText.roleManager }}</option>
                    <option value="admin">{{ listText.roleAdmin }}</option>
                  </select>
                </ui-select-input>
              </ui-field>
            }

            <!-- On an existing customer only: a new one has nothing keyed yet. -->
            @if (showsSourceId()) {
              <ui-field
                [field]="form.sourceId"
                [label]="text.sourceId"
                [hint]="text.sourceIdHint"
                controlId="sourceId"
              >
                <input
                  uiInput
                  class="w-full"
                  autocomplete="off"
                  [formField]="form.sourceId"
                />
              </ui-field>
            }

            @if (isNew) {
              <p class="text-sm text-ink-subtle">{{ text.inviteHint }}</p>
            }

            @if (error()) {
              <p uiErrorText role="alert">{{ error() }}</p>
            }
            @if (resent()) {
              <p class="text-sm text-success" role="status">
                {{ text.resendSent }}
              </p>
            }

            <div class="flex flex-wrap gap-3">
              @if (!closed() && !locked()) {
                <button
                  uiButton
                  appSaveButton
                  type="submit"
                  [saving]="saving()"
                  [glyph]="submitIcon()"
                >
                  {{ submitLabel() }}
                </button>
                <!-- Saving without approving must stay possible. -->
                @if (isApproval()) {
                  <button
                    uiButton
                    variant="secondary"
                    type="button"
                    class="gap-2"
                    [disabled]="saving()"
                    (click)="submit(false)"
                  >
                    <ui-icon [glyph]="saveIcon" class="size-4" />
                    {{ adminText.actions.save }}
                  </button>
                }
              }
              <!-- The invitation or the reset link: the API picks by status. -->
              @if (canSendLink() && !locked()) {
                <button
                  uiButton
                  variant="secondary"
                  type="button"
                  class="gap-2"
                  [disabled]="saving()"
                  (click)="sendPasswordLink()"
                >
                  <ui-icon [glyph]="sendIcon" class="size-4" />
                  {{ text.resend }}
                </button>
              }
              <button
                uiButton
                variant="secondary"
                appCancelButton
                type="button"
                (click)="cancel()"
              >
                {{ actionText.cancel }}
              </button>
            </div>
          </form>
        }
      }
    </div>
  `,
})
export class UserEditorPage implements UnsavedChangesAware {
  protected readonly saveIcon = saveIcon;
  protected readonly sendIcon = sendIcon;
  private readonly service = inject(StaffUsersService);
  private readonly tiersService = inject(TiersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly accountsConfig = inject(ACCOUNTS_CONFIG);

  protected readonly text = inject(ADMIN_ACCOUNTS_TEXT).users.editor;
  protected readonly fields = staffFields(
    inject(SHARED_TEXT).fields,
    inject(ADMIN_TEXT).fields,
  );
  private readonly kinds = inject(SHARED_ACCOUNTS_TEXT).partyKind;
  protected readonly listText = inject(ADMIN_ACCOUNTS_TEXT).users.list;
  /** In the deployment's order: the first is where a form starts. */
  protected readonly customerTypes: readonly SegmentOption<CustomerType>[] =
    this.accountsConfig.customerTypes.map((value) => ({
      value,
      label: this.kinds[value],
    }));
  private readonly firstType = this.accountsConfig.customerTypes[0];
  /** A kind no longer sold to: the form starts it on one it can save. */
  protected readonly typeLeftBehind = computed(() => {
    const account = this.account();
    return (
      account?.role === 'user' &&
      !this.accountsConfig.customerTypes.includes(
        account.customerType ?? 'person',
      )
    );
  });
  protected readonly adminText = inject(ADMIN_TEXT);
  private readonly adminCatalogText = inject(ADMIN_CATALOG_TEXT);
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly ownershipText = inject(ADMIN_ACCOUNTS_TEXT).ownership;
  private readonly ownership = inject(OwnershipService);
  protected readonly baseTierLabel = computed(() =>
    baseTierName(this.adminCatalogText.tiers.defaultName, this.tiers()),
  );
  protected readonly otherTiers = computed(() =>
    this.tiers().filter((t) => !t.isDefault),
  );

  protected readonly phoneInput = this.config.phoneInput;
  private readonly companyIdInput = this.config.companyIdInput;

  private readonly idParam = this.route.snapshot.paramMap.get('id');
  protected readonly isNew = this.idParam === null;

  /** Which kind a *new* account is; an existing one says so itself. */
  private readonly newKind: UserKind =
    this.route.snapshot.data['kind'] === 'staff' ? 'staff' : 'customer';

  protected readonly loading = signal(!this.isNew);
  protected readonly showSkeleton = delayedLoading(this.loading);
  protected readonly notFound = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tiers = signal<CustomerTier[]>([]);
  protected readonly account = signal<StaffUser | null>(null);

  protected readonly isCustomer = computed(() =>
    this.isNew ? this.newKind === 'customer' : this.account()?.role === 'user',
  );
  /** Only an admin sees a role field, and only on a staff account. */
  protected readonly showsRole = computed(
    () => !this.isCustomer() && this.auth.user()?.role === 'admin',
  );
  /** Admin only: it decides what an exchange may reach. */
  protected readonly showsSourceId = computed(
    () => this.isCustomer() && this.auth.user()?.role === 'admin',
  );
  /** A pending account is a registration awaiting a decision. */
  protected readonly isApproval = computed(
    () => this.account()?.status === 'pending',
  );
  protected readonly closed = computed(
    () => this.account()?.status === 'anonymized',
  );
  /** In flight counts as not owned: the API refuses the save anyway. */
  protected readonly locked = computed(
    () => this.isCustomer() && this.ownership.owns('customers'),
  );
  /** The "new customer" route with nothing to create on it. */
  protected readonly newAndLocked = computed(() => this.isNew && this.locked());

  protected readonly canSendLink = computed(() => {
    const status = this.account()?.status;
    return status === 'invited' || status === 'active';
  });
  /** Cleared on the next action, so it never outlives what it reports. */
  protected readonly resent = signal(false);

  private readonly model = signal<UserDraft>({
    email: '',
    customerType: this.firstType,
    firstName: '',
    lastName: '',
    phone: '',
    companyName: '',
    companyRegistrationId: '',
    tierId: 'default',
    role: 'manager',
    sourceId: '',
  });

  protected readonly form = form(
    this.model,
    (user) => {
      // The whole area belongs to an exchange; nothing here is the shop's.
      disabled(user, { when: () => this.locked() });
      // Shown only on a new account; an existing one cannot change it.
      if (this.isNew) {
        required(user.email, { message: this.fields.email.required });
        emailAddress(user.email, this.fields.email.invalid);
      }
      required(user.firstName, { message: this.fields.firstName.required });
      required(user.lastName, { message: this.fields.lastName.required });
      completeMask(
        user.phone,
        this.phoneInput?.mask,
        this.fields.phone.incomplete,
      );
      // Hidden, the company's fields count for nothing and are never sent.
      hidden(user.companyName, { when: () => !this.isCompany() });
      hidden(user.companyRegistrationId, { when: () => !this.isCompany() });
      required(user.companyName, {
        message: this.fields.companyName.required,
      });
      required(user.companyRegistrationId, {
        message: this.fields.companyId.required,
      });
      companyIdFormat(
        user.companyRegistrationId,
        this.companyIdInput?.formats,
        this.fields.companyId.format,
      );
      // An approval has nothing to fall back on; a plain save does not ask.
      required(user.tierId, {
        when: () => this.isApproval(),
        message: this.text.validation.tierRequired,
      });
    },
    { name: 'user-editor' },
  );

  protected readonly isCompany = computed(
    () => this.isCustomer() && this.form.customerType().value() === 'company',
  );

  private readonly unsaved = new UnsavedChanges(() => this.snapshot());
  private readonly close = injectEditorReturn();

  protected readonly title = computed(() => {
    if (this.isNew) {
      return this.newKind === 'staff'
        ? this.text.newStaffTitle
        : this.text.newCustomerTitle;
    }
    return this.isApproval() ? this.text.approveTitle : this.text.editTitle;
  });

  protected readonly submitLabel = computed(() => {
    if (this.isNew) return this.text.create;
    return this.isApproval() ? this.text.approve : this.adminText.actions.save;
  });

  protected readonly submitIcon = computed<Glyph>(() =>
    this.isApproval() ? circleCheckIcon : saveIcon,
  );

  private readonly dateFormat = new Intl.DateTimeFormat(this.config.locale, {
    dateStyle: 'medium',
  });
  protected readonly registered = computed(() => {
    const iso = this.account()?.createdAt;
    return iso ? this.dateFormat.format(new Date(iso)) : '';
  });

  constructor() {
    usePageSeo({ name: () => this.title() });
    void this.ownership.load();
    void this.load();
  }

  hasUnsavedChanges(): boolean {
    return this.unsaved.any();
  }

  private async load(): Promise<void> {
    const id = this.idParam;
    if (id !== null) {
      const user = await this.service.get(id);
      if (!user) {
        this.notFound.set(true);
        this.loading.set(false);
        return;
      }
      this.account.set(user);
      this.seed(user);
      this.loading.set(false);
    }
    // Which kind this is is only settled once the account loads.
    if (this.isCustomer()) {
      this.tiers.set(await this.tiersService.list().then((r) => r.tiers));
    }
    this.unsaved.loaded();
  }

  /** Fill the form from a stored account, undoing the canonical forms the
   * masked fields are entered in. */
  private seed(user: StaffUser): void {
    const stored: CustomerType = user.customerType ?? 'person';
    const type = this.accountsConfig.customerTypes.includes(stored)
      ? stored
      : this.firstType;
    this.model.set({
      email: user.email,
      customerType: type,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      phone: typedPhone(user.phone, this.phoneInput),
      companyName: user.companyName ?? '',
      // As stored, so an old shape can be read and corrected.
      companyRegistrationId: user.companyRegistrationId ?? '',
      // A pending account has no tier yet and must be given one explicitly.
      tierId: user.status === 'pending' ? '' : (user.tierId ?? 'default'),
      role: user.role === 'admin' ? 'admin' : 'manager',
      sourceId: user.sourceId ?? '',
    });
  }

  private snapshot(): string {
    return JSON.stringify(this.model());
  }

  /** A new link retires the old one, so only one is ever live. */
  protected async sendPasswordLink(): Promise<void> {
    const account = this.account();
    if (!account) return;
    this.error.set(null);
    this.resent.set(false);
    this.saving.set(true);
    try {
      const result = await this.service.sendPasswordLink(account.id);
      if (result.ok) this.resent.set(true);
      else this.error.set(this.listText.errors[result.code]);
    } catch {
      this.error.set(this.text.saveError);
    } finally {
      this.saving.set(false);
    }
  }

  protected statusLabel(status: StaffUser['status']): string {
    return userStatusLabel(this.listText, status);
  }

  protected readonly statusTone = userStatusTone;

  /** Corrections are written before the approval follows. */
  protected async submit(approving = true): Promise<void> {
    // The secondary button does not submit, so it marks the attempt.
    submitAttempt(this.form).set(true);
    const approve = approving && this.isApproval();
    // A correction without the approval may leave the tier for later.
    const blocking = this.form()
      .errorSummary()
      .filter((error) => approve || error.fieldTree !== this.form.tierId);
    if (blocking.length > 0) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      const user = this.isNew
        ? await this.createAccount()
        : await this.saveEdits();
      // Decided from the status the screen opened on, not the reply.
      if (user && approve) {
        const approved = await this.service.approve(user.id, this.tierId());
        if (!approved.ok) {
          return this.error.set(this.listText.errors[approved.code]);
        }
      }
      if (user) await this.leave();
    } catch {
      this.error.set(this.text.saveError);
    } finally {
      this.saving.set(false);
    }
  }

  private async createAccount(): Promise<StaffUser | null> {
    const value = this.model();
    const result = await this.service.create({
      email: value.email.trim(),
      role: this.isCustomer() ? 'user' : value.role,
      tierId: this.isCustomer() ? this.tierId() : null,
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      ...(this.isCustomer() ? { customerType: value.customerType } : {}),
      ...this.contactFields(),
      ...(this.showsSourceId()
        ? { sourceId: value.sourceId.trim() || null }
        : {}),
    });
    if (result.ok) return result.user;
    this.error.set(this.listText.errors[result.code]);
    return null;
  }

  private async saveEdits(): Promise<StaffUser | null> {
    const value = this.model();
    const contact = this.contactFields();
    const result = await this.service.update(this.idParam as string, {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      phone: contact.phone ?? null,
      customerType: this.isCustomer() ? value.customerType : null,
      companyName: contact.companyName ?? null,
      companyRegistrationId: contact.companyRegistrationId ?? null,
      tierId: this.isCustomer() ? this.tierId() : null,
      // Only when this caller may set it, so a manager is never refused.
      ...(this.showsRole() ? { role: value.role } : {}),
      ...(this.showsSourceId()
        ? { sourceId: value.sourceId.trim() || null }
        : {}),
    });
    if (result.ok) return result.user;
    this.error.set(this.listText.errors[result.code]);
    return null;
  }

  /** `''` (only reachable before an approval) and the base list are both null. */
  private tierId(): string | null {
    const value = this.model().tierId;
    return value && value !== 'default' ? value : null;
  }

  /** The contact fields in the form the API stores them in. Omitted rather
   * than empty, since all three are optional on creation. */
  private contactFields(): {
    phone?: string;
    companyName?: string;
    companyRegistrationId?: string;
  } {
    const value = this.model();
    const phone = canonicalPhone(value.phone, this.phoneInput);
    const companyName = this.isCompany() ? value.companyName.trim() : '';
    const companyId = this.isCompany()
      ? value.companyRegistrationId.trim()
      : '';
    return {
      ...(phone ? { phone } : {}),
      ...(companyName ? { companyName } : {}),
      ...(companyId ? { companyRegistrationId: companyId } : {}),
    };
  }

  private async leave(): Promise<void> {
    this.unsaved.leave();
    await this.close(this.listUrl());
  }

  protected cancel(): void {
    // The route's canDeactivate guard confirms if there are unsaved changes.
    void this.close(this.listUrl());
  }

  private listUrl(): string {
    return this.isCustomer() ? '/admin/users' : '/admin/users/staff';
  }
}
