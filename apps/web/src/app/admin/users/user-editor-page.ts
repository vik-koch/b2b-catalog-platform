import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CustomerTier,
  CustomerType,
  PartySuggestion,
  emailSchema,
  StaffUser,
  UserKind,
  UserRole,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { AuthService } from '../../auth/auth.service';
import {
  canonicalPhone,
  companyIdValidators,
  emailFormat,
  phoneValidators,
  typedPhone,
} from '../../core/contact-fields';
import { delayedLoading } from '../../core/delayed-loading';
import { FieldErrors } from '../../core/form-errors';
import { usePageSeo } from '../../core/page-seo';
import { UnsavedChangesAware } from '../../core/unsaved-changes.guard';
import { Button } from '../../ui/button';
import { CompanyFields } from '../../parties/company-fields';
import { EmailField } from '../../ui/email-field';
import { FieldLabel } from '../../ui/field-label';
import { PhoneField } from '../../ui/phone-field';
import { AdminIcon, AdminIconName } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { Skeleton } from '../../ui/skeleton';
import { injectEditorReturn } from '../editor-return';
import { TiersService } from '../tiers/tiers.service';
import { StaffUsersService } from './users.service';
import { SelectField } from '../../ui/select-field';
import { StatusBadge } from '../../ui/status-badge';
import { userStatusTone } from './user-status';
import { Segmented, SegmentOption } from '../../ui/segmented';

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
    ReactiveFormsModule,
    Button,
    AdminIcon,
    CompanyFields,
    EmailField,
    FieldLabel,
    Input,
    PhoneField,
    Skeleton,
    SelectField,
    StatusBadge,
    Segmented,
  ],
  template: `
    <!-- One narrow column for the whole screen, heading included: a full-width
         title over a narrow form is a third layout where two will do. -->
    <div class="max-w-xl">
      <h1 class="mb-6 text-3xl font-medium tracking-tight">{{ title() }}</h1>

      @if (loading()) {
        @if (showSkeleton()) {
          <app-skeleton [lines]="5" />
        }
      } @else if (notFound()) {
        <p class="text-muted" role="alert">{{ text.notFound }}</p>
      } @else {
        <!-- The account's fixed facts: who this is and where it stands. An
             existing account leads with them because they are the context for
             every field below. -->
        @if (account(); as user) {
          <!-- Breaking, because an address is one word: the value track
               floors at its longest word, so an email nobody shortened widens
               the grid past the screen rather than wrapping inside it. -->
          <dl
            class="mb-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm break-words"
          >
            <dt class="text-subtle">{{ text.email }}</dt>
            <dd class="font-medium text-stone-700">{{ user.email }}</dd>
            <dt class="text-subtle">{{ listText.registered }}</dt>
            <dd class="text-subtle">{{ registered() }}</dd>
            <dt class="text-subtle">{{ text.status }}</dt>
            <dd>
              <span appStatusBadge [tone]="statusTone(user.status)">{{
                statusLabel(user.status)
              }}</span>
            </dd>
          </dl>
        }

        @if (closed()) {
          <p class="mb-6 rounded-md bg-stone-100 px-4 py-2 text-sm text-muted">
            {{ text.closed }}
          </p>
        }

        <form
          [formGroup]="form"
          (ngSubmit)="submit()"
          novalidate
          class="space-y-6"
        >
          @if (isNew) {
            <app-email-field
              [control]="form.controls.email"
              [label]="text.email"
              [text]="emailText"
              [required]="true"
              [invalid]="isInvalid('email')"
              autocomplete="off"
            />
          } @else {
            <p class="text-sm text-muted">{{ text.emailFixed }}</p>
          }

          @if (isCustomer()) {
            <fieldset>
              <legend appFieldLabel>{{ text.customerType }}</legend>
              <app-segmented
                [options]="customerTypes"
                size="md"
                formControlName="customerType"
              />
            </fieldset>
          }

          <div class="grid gap-6 sm:grid-cols-2">
            <div>
              <label for="firstName" appFieldLabel>
                {{ text.firstName }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <input
                id="firstName"
                type="text"
                formControlName="firstName"
                autocomplete="off"
                aria-required="true"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('firstName') || null"
              />
              @if (isInvalid('firstName')) {
                <p class="mt-1 text-sm text-red-600">
                  {{ text.validation.firstNameRequired }}
                </p>
              }
            </div>

            <div>
              <label for="lastName" appFieldLabel>
                {{ text.lastName }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <input
                id="lastName"
                type="text"
                formControlName="lastName"
                autocomplete="off"
                aria-required="true"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('lastName') || null"
              />
              @if (isInvalid('lastName')) {
                <p class="mt-1 text-sm text-red-600">
                  {{ text.validation.lastNameRequired }}
                </p>
              }
            </div>
          </div>

          @if (isCompany()) {
            <app-company-fields
              idInputId="companyRegistrationId"
              [idControl]="form.controls.companyRegistrationId"
              [nameControl]="form.controls.companyName"
              [text]="companyText"
              [idInvalid]="isInvalid('companyRegistrationId')"
              [nameInvalid]="isInvalid('companyName')"
              (picked)="fillCompanyFrom($event)"
            />
          }

          <!-- Optional here, unlike on the registration form: staff often set
               an account up from an email alone, and a phone number they do
               not have is not a reason to block the account. -->
          <app-phone-field
            [control]="form.controls.phone"
            [label]="text.phone"
            [text]="phoneText"
            [invalid]="isInvalid('phone')"
            autocomplete="off"
          />

          @if (isCustomer()) {
            <div>
              <label for="tier" appFieldLabel>
                {{ text.tier }}
                @if (isApproval()) {
                  <span class="text-accent" aria-hidden="true">*</span>
                }
              </label>
              <app-select-field class="w-full">
                <select
                  appInput
                  id="tier"
                  formControlName="tierId"
                  class="w-full"
                  [attr.aria-invalid]="isInvalid('tierId') || null"
                >
                  <!-- No tier is a default anywhere (ADR 0031), so an approval
                       has nothing to fall back on and must be chosen. -->
                  @if (isApproval()) {
                    <option value="">{{ text.tierChoose }}</option>
                  }
                  <option value="default">{{ baseTierLabel }}</option>
                  @for (tier of tiers(); track tier.id) {
                    <option [value]="tier.id">{{ tier.label }}</option>
                  }
                </select>
              </app-select-field>
              @if (isInvalid('tierId')) {
                <p class="mt-1 text-sm text-red-600">
                  {{ text.validation.tierRequired }}
                </p>
              }
            </div>
          }

          <!-- Admin only. A manager who could grant a role could grant it to
               themselves, so the field is absent for them and the API refuses
               it besides. -->
          @if (showsRole()) {
            <div>
              <label for="role" appFieldLabel>{{ text.role }}</label>
              <app-select-field class="w-full">
                <select
                  id="role"
                  formControlName="role"
                  appInput
                  class="w-full"
                >
                  <option value="manager">{{ listText.roleManager }}</option>
                  <option value="admin">{{ listText.roleAdmin }}</option>
                </select>
              </app-select-field>
            </div>
          }

          @if (isNew) {
            <p class="text-sm text-muted">{{ text.inviteHint }}</p>
          }

          @if (error()) {
            <p class="text-sm text-red-700" role="alert">{{ error() }}</p>
          }
          @if (resent()) {
            <p class="text-sm text-green-700" role="status">
              {{ text.resendSent }}
            </p>
          }

          <div class="flex flex-wrap gap-3">
            @if (!closed()) {
              <button
                appButton
                type="submit"
                class="gap-2"
                [disabled]="saving()"
              >
                <app-admin-icon [name]="submitIcon()" class="h-4 w-4" />
                {{ saving() ? common.saving : submitLabel() }}
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
                  <app-admin-icon name="save" class="h-4 w-4" />
                  {{ common.save }}
                </button>
              }
            }
            <!-- Only while the account has not chosen a password: after that
                 the way back in is a password reset, not this mail. -->
            @if (canResend()) {
              <button
                appButton
                variant="secondary"
                type="button"
                class="gap-2"
                [disabled]="saving()"
                (click)="resendInvitation()"
              >
                <app-admin-icon name="send" class="h-4 w-4" />
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
              <app-admin-icon name="x" class="h-4 w-4" />
              {{ common.cancel }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class UserEditorPage implements UnsavedChangesAware {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(StaffUsersService);
  private readonly tiersService = inject(TiersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(ADMIN_TEXT).userEditor;
  /** Shared vocabulary — the same words the list uses for the same things. */
  protected readonly listText = inject(ADMIN_TEXT).userList;
  protected readonly customerTypes: readonly SegmentOption<CustomerType>[] = [
    { value: 'person', label: this.listText.typePerson },
    { value: 'company', label: this.listText.typeCompany },
  ];
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly baseTierLabel = inject(ADMIN_TEXT).tierList.defaultLabel;

  private readonly phoneInput = this.config.phoneInput;
  private readonly companyIdInput = this.config.companyIdInput;

  // What the shared fields put under themselves — the admin's wording, not the
  // storefront's. Held as fields so the object identity is stable across change
  // detection.
  protected readonly emailText = {
    required: this.text.validation.emailRequired,
    invalid: this.text.validation.emailInvalid,
  };
  // No `required` wording: the number is optional on this screen, so there is
  // no such refusal to word.
  protected readonly phoneText = {
    incomplete: this.text.validation.phoneIncomplete,
  };
  protected readonly companyText = {
    ...this.text.companySuggest,
    idLabel: this.text.companyId,
    nameLabel: this.text.companyName,
    idFormat: this.text.validation.companyIdFormat,
    idRequired: this.text.validation.companyIdRequired,
    nameRequired: this.text.validation.companyNameRequired,
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
  /** A pending account is a registration awaiting a decision. */
  protected readonly isApproval = computed(
    () => this.account()?.status === 'pending',
  );
  protected readonly closed = computed(
    () => this.account()?.status === 'anonymized',
  );
  protected readonly canResend = computed(
    () => this.account()?.status === 'invited',
  );
  /** Cleared on the next action, so it never outlives what it reports. */
  protected readonly resent = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, emailFormat()]],
    customerType: ['person' as CustomerType],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    phone: ['', phoneValidators(this.phoneInput, false)],
    companyName: [''],
    companyRegistrationId: [''],
    /** `default` is the base price list; `''` only exists before an approval. */
    tierId: ['default'],
    role: ['manager' as UserRole],
  });

  protected readonly isCompany = signal(false);
  protected readonly fieldErrors = new FieldErrors(this.form);

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
    return this.isApproval() ? this.text.approve : this.common.save;
  });

  protected readonly submitIcon = computed<AdminIconName>(() =>
    this.isApproval() ? 'circle-check' : 'save',
  );

  private readonly dateFormat = new Intl.DateTimeFormat(
    this.config.catalog.currency.locale,
    { dateStyle: 'medium' },
  );
  protected readonly registered = computed(() => {
    const iso = this.account()?.createdAt;
    return iso ? this.dateFormat.format(new Date(iso)) : '';
  });

  constructor() {
    usePageSeo({ name: () => this.title() });

    this.form.controls.customerType.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((type) => this.applyCompanyValidators(type));
    this.applyCompanyValidators('person');

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
    const type: CustomerType = user.customerType ?? 'person';
    this.form.patchValue(
      {
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
      },
      { emitEvent: false },
    );
    this.applyCompanyValidators(type);
  }

  private snapshot(): string {
    return JSON.stringify(this.form.getRawValue());
  }

  /**
   * Send the set-your-password link again — the mail was lost, filed as spam,
   * or its seven days ran out. Issuing a new link retires the old one, so
   * there is never more than one live way into the account.
   */
  protected async resendInvitation(): Promise<void> {
    const account = this.account();
    if (!account) return;
    this.error.set(null);
    this.resent.set(false);
    this.saving.set(true);
    try {
      const result = await this.service.resendInvitation(account.id);
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

  protected isInvalid(control: keyof typeof this.form.controls): boolean {
    return this.fieldErrors.show(this.form.controls[control]);
  }

  /**
   * Save. `approving` is what the primary button means on a pending account:
   * corrections are written first and the approval follows, so a manager who
   * fixed a digit on the way in does not approve the version with the typo.
   */
  protected async submit(approving = true): Promise<void> {
    this.fieldErrors.markSubmitted();
    const approve = approving && this.isApproval();
    if (approve && !this.form.controls.tierId.value) {
      this.form.controls.tierId.setErrors({ required: true });
    }
    if (this.form.invalid) return;

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
    const value = this.form.getRawValue();
    const result = await this.service.create({
      email: value.email.trim(),
      role: this.isCustomer() ? 'user' : value.role,
      tierId: this.isCustomer() ? this.tierId() : null,
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      ...this.contactFields(),
    });
    if (result.ok) return result.user;
    this.error.set(this.listText.errors[result.code]);
    return null;
  }

  private async saveEdits(): Promise<StaffUser | null> {
    const value = this.form.getRawValue();
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
    });
    if (result.ok) return result.user;
    this.error.set(this.listText.errors[result.code]);
    return null;
  }

  /** `''` (only reachable before an approval) and the base list are both null. */
  private tierId(): string | null {
    const value = this.form.controls.tierId.value;
    return value && value !== 'default' ? value : null;
  }

  /** The contact fields in the form the API stores them in. Omitted rather
   * than empty, since all three are optional on creation. */
  private contactFields(): {
    phone?: string;
    companyName?: string;
    companyRegistrationId?: string;
  } {
    const value = this.form.getRawValue();
    const phone = canonicalPhone(value.phone, this.phoneInput);
    const isCompany = this.isCustomer() && value.customerType === 'company';
    const companyName = isCompany ? value.companyName.trim() : '';
    const companyId = isCompany ? value.companyRegistrationId.trim() : '';
    return {
      ...(phone ? { phone } : {}),
      ...(companyName ? { companyName } : {}),
      ...(companyId ? { companyRegistrationId: companyId } : {}),
    };
  }

  /**
   * The registration number is required exactly when the account says it is a
   * company — the contract refuses it in the other direction too, so the field
   * is cleared rather than left holding a stale value.
   */
  /**
   * A picked company, across both fields. Staff get the same accelerator the
   * customer does — a manager typing an account up from a phone call is the
   * likeliest person to have only half the details.
   */
  protected fillCompanyFrom(party: PartySuggestion): void {
    this.form.patchValue({
      companyName: party.name,
      ...(party.registrationId
        ? { companyRegistrationId: party.registrationId }
        : {}),
    });
  }

  private applyCompanyValidators(type: CustomerType): void {
    this.isCompany.set(this.isCustomer() && type === 'company');
    const fields = [
      [this.form.controls.companyName, [Validators.required]],
      [
        this.form.controls.companyRegistrationId,
        companyIdValidators(this.companyIdInput?.formats),
      ],
    ] as const;

    for (const [control, validators] of fields) {
      control.setValidators(this.isCompany() ? [...validators] : []);
      if (!this.isCompany()) control.setValue('', { emitEvent: false });
      control.updateValueAndValidity({ emitEvent: false });
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
