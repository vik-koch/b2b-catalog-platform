import { Component, computed, inject, signal } from '@angular/core';
import { disabled, form, hidden, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CustomerType,
  PartySuggestion,
  UserRole,
} from '@b2b-catalog-platform/shared';
import {
  CustomerTier,
  StaffUser,
  UserKind,
} from '@b2b-catalog-platform/shared/admin';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { staffFields } from '../staff-fields';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { AuthService } from '../../shared/auth/auth.service';
import { canonicalPhone, typedPhone } from '../../shared/core/contact-fields';
import { delayedLoading } from '../../shared/core/delayed-loading';
import {
  companyIdFormat,
  completeMask,
  emailAddress,
} from '../../shared/core/field-rules';
import { usePageSeo } from '../../shared/core/page-seo';
import { UnsavedChangesAware } from '../unsaved-changes.guard';
import { LockedNote } from '../ownership/locked-note';
import { Button } from '../../shared/ui/button';
import { Notice } from '../../shared/ui/notice';
import { CompanyFields } from '../../shared/parties/company-fields';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { submitAttempt } from '../../shared/ui/submit-attempt';
import { PhoneInput } from '../../shared/ui/phone-input';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Input } from '../../shared/ui/input';
import { Skeleton } from '../../shared/ui/skeleton';
import { injectEditorReturn } from '../../shared/edit-mode/editor-return';
import { SettingsService } from '../settings/settings.service';
import { TiersService } from '../tiers/tiers.service';
import { StaffUsersService } from './users.service';
import { SelectField } from '../../shared/ui/select-field';
import { StatusBadge } from '../../shared/ui/status-badge';
import { userStatusTone } from './user-status';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { WarningNote } from '../../shared/ui/warning-note';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';
import { circleCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/circle-check';
import { saveIcon } from '@b2b-catalog-platform/ui/icons/glyphs/save';
import { sendIcon } from '@b2b-catalog-platform/ui/icons/glyphs/send';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

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
 * Add, edit and approve an account (FR-AUTH-03/04) — `/admin/users/new`,
 * `/admin/users/staff/new` and `/admin/users/:id/edit`. One screen for all
 * three because they ask the same questions of the same fields; only the verb
 * on the primary button differs.
 *
 * Approving lives here rather than in a dialog because approval *is* a review:
 * the registration form collects a name, a phone number and a registration
 * number precisely so a human can judge them, and a manager who spots a
 * transposed digit should be able to fix it in the same breath as approving.
 *
 * The email address is shown and never editable. It is the sign-in name and the
 * identity the audit trail points at, so changing it is an account-recovery
 * flow with a confirmation to the new address — not a field on this form.
 */
@Component({
  selector: 'app-user-editor-page',
  imports: [
    FORM_FIELDS,
    LockedNote,
    Button,
    Icon,
    CompanyFields,
    Input,
    PhoneInput,
    Skeleton,
    SelectField,
    StatusBadge,
    Segmented,
    WarningNote,
    PageTitle,
    ErrorText,
    Notice,
  ],
  template: `
    <!-- One narrow column for the whole screen, heading included: a full-width
         title over a narrow form is a third layout where two will do. -->
    <div class="max-w-xl">
      <h1 appPageTitle class="mb-4">{{ title() }}</h1>

      @if (loading()) {
        @if (showSkeleton()) {
          <app-skeleton [lines]="5" />
        }
      } @else if (notFound()) {
        <p class="text-ink-subtle" role="alert">{{ text.notFound }}</p>
      } @else {
        <!-- The account's fixed facts: who this is and where it stands. An
             existing account leads with them because they are the context for
             every field below. -->
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
              <span appStatusBadge [tone]="statusTone(user.status)">{{
                statusLabel(user.status)
              }}</span>
            </dd>
          </dl>
        }

        @if (closed()) {
          <p appNotice tone="neutral" class="mb-6">
            {{ text.closed }}
          </p>
        }

        <!-- One banner for the whole form rather than a lock beside each
             field: the catalog editor marks the handful of fields an exchange
             writes, but here the area is closed whole, and an editor in which
             every input is greyed does not need each one labelled. -->
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
          <!-- Nothing to fill in, so nothing is drawn: a blank form whose Save
               is refused would only be a longer way of saying this. The way
               back stays, as it does on the catalog's own locked route. -->
          <button
            appButton
            variant="secondary"
            type="button"
            class="gap-2"
            (click)="cancel()"
          >
            <app-icon [glyph]="xIcon" class="size-4" />
            {{ actionText.cancel }}
          </button>
        } @else {
          <form [formRoot]="form" (submit)="submit()" class="space-y-6">
            @if (isNew) {
              <app-field
                [field]="form.email"
                [label]="fields.email.label"
                controlId="email"
              >
                <input
                  type="email"
                  autocomplete="off"
                  appInput
                  class="w-full"
                  [formField]="form.email"
                />
              </app-field>
            } @else {
              <p class="text-sm text-ink-subtle">{{ text.emailFixed }}</p>
            }

            @if (isCustomer()) {
              @if (typeLeftBehind()) {
                <app-warning-note>{{ text.typeNotAccepted }}</app-warning-note>
              }
              <!-- Only where the shop sells to more than one kind of customer
                   (FR-AUTH-13): with one, there is nothing to choose. -->
              @if (customerTypes.length > 1) {
                <app-field
                  group
                  [field]="form.customerType"
                  [label]="text.customerType"
                >
                  <app-segmented
                    [options]="customerTypes"
                    size="md"
                    [formField]="form.customerType"
                  />
                </app-field>
              }
            }

            <div class="grid gap-6 sm:grid-cols-2">
              <app-field
                [field]="form.firstName"
                [label]="fields.firstName.label"
                controlId="firstName"
              >
                <input
                  type="text"
                  autocomplete="off"
                  appInput
                  class="w-full"
                  [formField]="form.firstName"
                />
              </app-field>

              <app-field
                [field]="form.lastName"
                [label]="fields.lastName.label"
                controlId="lastName"
              >
                <input
                  type="text"
                  autocomplete="off"
                  appInput
                  class="w-full"
                  [formField]="form.lastName"
                />
              </app-field>
            </div>

            @if (isCompany()) {
              <app-company-fields
                idInputId="companyRegistrationId"
                [idField]="form.companyRegistrationId"
                [nameField]="form.companyName"
                [text]="companyText"
                (picked)="fillCompanyFrom($event)"
              />
            }

            <!-- Optional here, unlike on the registration form: staff often set
               an account up from an email alone, and a phone number they do
               not have is not a reason to block the account. -->
            <app-field
              [field]="form.phone"
              [label]="fields.phone.label"
              controlId="phone"
            >
              <app-phone-input
                [field]="form.phone"
                [phone]="phoneInput"
                autocomplete="off"
              />
            </app-field>

            @if (isCustomer()) {
              <app-field
                [field]="form.tierId"
                [label]="text.tier"
                controlId="tier"
              >
                <app-select-field class="w-full">
                  <select appInput class="w-full" [formField]="form.tierId">
                    <!-- No tier is a default anywhere (ADR 0031), so an approval
                       has nothing to fall back on and must be chosen. -->
                    @if (isApproval()) {
                      <option value="">{{ text.tierChoose }}</option>
                    }
                    <!-- The default list is offered as "no tier" and not a
                       second time under its own id: an account on it carries a
                       null, the same state a guest is in, and two spellings of
                       one state is what the null is here to avoid. -->
                    <option value="default">{{ baseTierLabel() }}</option>
                    @for (tier of otherTiers(); track tier.id) {
                      <option [value]="tier.id">{{ tier.label }}</option>
                    }
                  </select>
                </app-select-field>
              </app-field>
            }

            <!-- Admin only. A manager who could grant a role could grant it to
               themselves, so the field is absent for them and the API refuses
               it besides. -->
            @if (showsRole()) {
              <app-field
                [field]="form.role"
                [label]="text.role"
                controlId="role"
              >
                <app-select-field class="w-full">
                  <select appInput class="w-full" [formField]="form.role">
                    <option value="manager">{{ listText.roleManager }}</option>
                    <option value="admin">{{ listText.roleAdmin }}</option>
                  </select>
                </app-select-field>
              </app-field>
            }

            <!-- Admin only, and only on a customer: the key an exchange
                 addresses this account by (FR-ADM-14). Shown on an existing
                 account alone — a staff-created account has nothing to be
                 keyed against yet, and the field would invite a guess. -->
            @if (showsSourceId()) {
              <app-field
                [field]="form.sourceId"
                [label]="text.sourceId"
                [hint]="text.sourceIdHint"
                controlId="sourceId"
              >
                <input
                  appInput
                  class="w-full"
                  autocomplete="off"
                  [formField]="form.sourceId"
                />
              </app-field>
            }

            @if (isNew) {
              <p class="text-sm text-ink-subtle">{{ text.inviteHint }}</p>
            }

            @if (error()) {
              <p appErrorText role="alert">{{ error() }}</p>
            }
            @if (resent()) {
              <p class="text-sm text-success" role="status">
                {{ text.resendSent }}
              </p>
            }

            <div class="flex flex-wrap gap-3">
              @if (!closed() && !locked()) {
                <button
                  appButton
                  type="submit"
                  class="gap-2"
                  [disabled]="saving()"
                >
                  <app-icon [glyph]="submitIcon()" class="size-4" />
                  {{ saving() ? actionText.saving : submitLabel() }}
                </button>
                <!-- On a pending account the primary button approves, which is a
                   decision. Correcting a typo without taking that decision has
                   to stay possible, so it gets its own button. -->
                @if (isApproval()) {
                  <button
                    appButton
                    variant="secondary"
                    type="button"
                    class="gap-2"
                    [disabled]="saving()"
                    (click)="submit(false)"
                  >
                    <app-icon [glyph]="saveIcon" class="size-4" />
                    {{ adminText.actions.save }}
                  </button>
                }
              }
              <!-- For any account that may sign in: the invitation while it has
                 no password, the reset link once it has. Which one is the
                 API's decision, off the account's own status. -->
              @if (canSendLink() && !locked()) {
                <button
                  appButton
                  variant="secondary"
                  type="button"
                  class="gap-2"
                  [disabled]="saving()"
                  (click)="sendPasswordLink()"
                >
                  <app-icon [glyph]="sendIcon" class="size-4" />
                  {{ text.resend }}
                </button>
              }
              <button
                appButton
                variant="secondary"
                type="button"
                class="gap-2"
                (click)="cancel()"
              >
                <app-icon [glyph]="xIcon" class="size-4" />
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
  protected readonly xIcon = xIcon;
  private readonly service = inject(StaffUsersService);
  private readonly tiersService = inject(TiersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(ADMIN_TEXT).users.editor;
  protected readonly fields = staffFields(
    inject(SHARED_TEXT).fields,
    inject(ADMIN_TEXT).fields,
  );
  private readonly kinds = inject(SHARED_TEXT).partyKind;
  /** Shared vocabulary — the same words the list uses for the same things. */
  protected readonly listText = inject(ADMIN_TEXT).users.list;
  /**
   * The kinds of customer the shop sells to (FR-AUTH-13), in the order the
   * deployment lists them: the first is where a new customer starts.
   */
  protected readonly customerTypes: readonly SegmentOption<CustomerType>[] =
    this.config.customerTypes.map((value) => ({
      value,
      label: this.kinds[value],
    }));
  private readonly firstType = this.config.customerTypes[0];
  /**
   * An account stored as a kind the shop no longer sells to. The API refuses
   * to save it as one, so the form starts it on a kind it can be saved as and
   * says why the fields it now asks for are there.
   */
  protected readonly typeLeftBehind = computed(() => {
    const account = this.account();
    return (
      account?.role === 'user' &&
      !this.config.customerTypes.includes(account.customerType ?? 'person')
    );
  });
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  private readonly ownership = inject(SettingsService);
  /**
   * What an account with no tier of its own is charged, named: "Default
   * (Base list)". The option carries a null, which is also what a brand new
   * customer has — so it is marked as the default rather than sitting in the
   * list looking like one choice among several.
   */
  protected readonly baseTierLabel = computed(() =>
    this.adminText.tiers.defaultName.replace(
      '{list}',
      this.tiers().find((t) => t.isDefault)?.label ?? '',
    ),
  );
  protected readonly otherTiers = computed(() =>
    this.tiers().filter((t) => !t.isDefault),
  );

  protected readonly phoneInput = this.config.phoneInput;
  private readonly companyIdInput = this.config.companyIdInput;

  protected readonly companyText = {
    idLabel: this.fields.companyId.label,
    nameLabel: this.fields.companyName.label,
  };

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
  /**
   * Only an admin edits the source key (FR-ADM-14). A manager is refused it by
   * the API besides — it decides what an automated exchange may reach, which is
   * a deployment matter like the ownership switch rather than the customer
   * work a manager does.
   */
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
  /**
   * Whether an external system holds customer accounts (FR-ADM-10). Read on
   * the same terms as the catalog editor reads its own area: the load starts
   * in the constructor and resolves well before anyone has typed, and an
   * answer still in flight reads as not owned rather than painting a locked
   * form that may not be one. The API refuses the save either way.
   *
   * Staff accounts are never locked by it — an admin has to be able to appoint
   * another admin whatever the exchange holds.
   */
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
      // No tier is a default anywhere (ADR 0031), so an approval has nothing
      // to fall back on. The plain save on a pending account does not ask.
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

  // JSON snapshot of the form at load, for dirty detection.
  private original = '';
  private navigatingAway = false;
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
    return (
      !this.navigatingAway &&
      !this.loading() &&
      this.snapshot() !== this.original
    );
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
    // Only a customer form has a tier field, and which kind this is is only
    // settled once the account is loaded.
    if (this.isCustomer()) {
      this.tiers.set(await this.tiersService.list().then((r) => r.tiers));
    }
    this.original = this.snapshot();
  }

  /** Fill the form from a stored account, undoing the canonical forms the
   * masked fields are entered in. */
  private seed(user: StaffUser): void {
    const stored: CustomerType = user.customerType ?? 'person';
    const type = this.config.customerTypes.includes(stored)
      ? stored
      : this.firstType;
    this.model.set({
      email: user.email,
      customerType: type,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      phone: typedPhone(user.phone, this.phoneInput),
      companyName: user.companyName ?? '',
      // Shown exactly as stored, whatever shape it is in — including one from
      // before the current config, which staff must be able to read and
      // correct rather than have silently reshaped.
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

  /**
   * Send the account a way back in — the mail was lost, filed as spam, its
   * deadline ran out, or somebody locked out rang the shop rather than using
   * the form. Issuing a new link retires the old one, so there is never more
   * than one live way into the account.
   */
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

  /** The same words and colours the list gives these states. */
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

  /**
   * Save. `approving` is what the primary button means on a pending account:
   * corrections are written first and the approval follows, so a manager who
   * fixed a digit on the way in does not approve the version with the typo.
   */
  protected async submit(approving = true): Promise<void> {
    // The secondary button is no submit button, so it records the attempt
    // that the form's own submit would.
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
      // `approve` was decided before the save, from the status the screen was
      // opened on — the update returns the same row, still pending, and
      // re-reading it here would only invite the two to disagree.
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
      // Sent only when this caller may set it, so a manager's save is never
      // refused for a field their form does not even show.
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

  /**
   * A picked company, across both fields. Staff get the same accelerator the
   * customer does — a manager typing an account up from a phone call is the
   * likeliest person to have only half the details.
   */
  protected fillCompanyFrom(party: PartySuggestion): void {
    this.form.companyName().value.set(party.name);
    if (party.registrationId) {
      this.form.companyRegistrationId().value.set(party.registrationId);
    }
  }

  private async leave(): Promise<void> {
    this.navigatingAway = true; // let the unsaved-changes guard pass
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
