import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CustomerTier,
  CustomerType,
  emailSchema,
  StaffUser,
  UserKind,
  UserRole,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { AuthService } from '../../auth/auth.service';
import {
  canonicalCompanyId,
  canonicalPhone,
  companyIdPattern,
  typedCompanyId,
  typedPhone,
} from '../../core/contact-fields';
import { delayedLoading } from '../../core/delayed-loading';
import { FieldErrors } from '../../core/form-errors';
import { completeMask } from '../../core/masked-input';
import { usePageSeo } from '../../core/page-seo';
import { UnsavedChangesAware } from '../../core/unsaved-changes.guard';
import { zodValidator } from '../../core/zod-validator';
import { Button } from '../../ui/button';
import { DigitMask } from '../../ui/digit-mask';
import { FieldLabel } from '../../ui/field-label';
import { AdminIcon, AdminIconName } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { Skeleton } from '../../ui/skeleton';
import { injectEditorReturn } from '../editor-return';
import { TiersService } from '../tiers/tiers.service';
import { StaffUsersService } from './users.service';

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
    DigitMask,
    FieldLabel,
    Input,
    Skeleton,
  ],
  template: `
    <h1 class="mb-6 text-3xl font-bold tracking-tight">{{ title() }}</h1>

    @if (loading()) {
      @if (showSkeleton()) {
        <app-skeleton [lines]="5" />
      }
    } @else if (notFound()) {
      <p class="text-muted" role="alert">{{ text.notFound }}</p>
    } @else {
      <div class="max-w-2xl">
        <!-- The account's fixed facts: who this is and where it stands. An
             existing account leads with them because they are the context for
             every field below. -->
        @if (account(); as user) {
          <dl class="mb-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt class="text-subtle">{{ text.email }}</dt>
            <dd class="font-medium text-stone-700">{{ user.email }}</dd>
            <dt class="text-subtle">{{ listText.registered }}</dt>
            <dd class="text-subtle">{{ registered() }}</dd>
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
            <div>
              <label for="email" appFieldLabel>
                {{ text.email }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <input
                id="email"
                type="email"
                formControlName="email"
                autocomplete="off"
                aria-required="true"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('email') || null"
              />
              @if (isInvalid('email')) {
                <p class="mt-1 text-sm text-red-600">
                  {{
                    form.controls.email.hasError('required')
                      ? text.validation.emailRequired
                      : text.validation.emailInvalid
                  }}
                </p>
              }
            </div>
          } @else {
            <p class="text-sm text-muted">{{ text.emailFixed }}</p>
          }

          @if (isCustomer()) {
            <fieldset>
              <legend appFieldLabel>{{ text.customerType }}</legend>
              <div
                role="radiogroup"
                class="inline-flex gap-1 rounded-lg border border-border-strong bg-white p-1"
              >
                <label [class]="segClass('person')">
                  <input
                    type="radio"
                    class="sr-only"
                    formControlName="customerType"
                    value="person"
                  />
                  {{ listText.typePerson }}
                </label>
                <label [class]="segClass('company')">
                  <input
                    type="radio"
                    class="sr-only"
                    formControlName="customerType"
                    value="company"
                  />
                  {{ listText.typeCompany }}
                </label>
              </div>
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

          <!-- Optional here, unlike on the registration form: staff often set
               an account up from an email alone, and a phone number they do
               not have is not a reason to block the account. -->
          <div>
            <label for="phone" appFieldLabel>{{ text.phone }}</label>
            @if (phoneInput; as config) {
              <div class="flex">
                <span
                  class="inline-flex items-center rounded-l-md border border-r-0 border-border-strong bg-stone-100 px-3 text-muted"
                >
                  {{ config.countryCode }}
                </span>
                <input
                  id="phone"
                  type="tel"
                  appDigitMask
                  [mask]="config.mask ?? ''"
                  formControlName="phone"
                  autocomplete="off"
                  appInput
                  class="w-full rounded-l-none"
                  [attr.aria-invalid]="isInvalid('phone') || null"
                />
              </div>
            } @else {
              <input
                id="phone"
                type="tel"
                formControlName="phone"
                autocomplete="off"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('phone') || null"
              />
            }
            @if (isInvalid('phone')) {
              <p class="mt-1 text-sm text-red-600">
                {{ text.validation.phoneIncomplete }}
              </p>
            }
          </div>

          @if (isCompany()) {
            <div>
              <label for="companyRegistrationId" appFieldLabel>
                {{ text.companyId }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <div class="flex">
                @if (companyIdPrefix) {
                  <span
                    class="inline-flex items-center rounded-l-md border border-r-0 border-border-strong bg-stone-100 px-3 text-muted"
                  >
                    {{ companyIdPrefix }}
                  </span>
                }
                @if (companyIdMask; as mask) {
                  <input
                    id="companyRegistrationId"
                    type="text"
                    appDigitMask
                    [mask]="mask"
                    formControlName="companyRegistrationId"
                    inputmode="numeric"
                    aria-required="true"
                    appInput
                    class="w-full"
                    [class.rounded-l-none]="!!companyIdPrefix"
                    [attr.aria-invalid]="
                      isInvalid('companyRegistrationId') || null
                    "
                  />
                } @else {
                  <input
                    id="companyRegistrationId"
                    type="text"
                    formControlName="companyRegistrationId"
                    aria-required="true"
                    appInput
                    class="w-full"
                    [class.rounded-l-none]="!!companyIdPrefix"
                    [attr.aria-invalid]="
                      isInvalid('companyRegistrationId') || null
                    "
                  />
                }
              </div>
              @if (isInvalid('companyRegistrationId')) {
                <p class="mt-1 text-sm text-red-600">
                  {{
                    form.controls.companyRegistrationId.hasError('required')
                      ? text.validation.companyIdRequired
                      : companyIdHint()
                  }}
                </p>
              } @else if (companyIdExample) {
                <p class="mt-1 text-sm text-muted">{{ companyIdHint() }}</p>
              }
            </div>
          }

          @if (isCustomer()) {
            <div>
              <label for="tier" appFieldLabel>
                {{ text.tier }}
                @if (isApproval()) {
                  <span class="text-accent" aria-hidden="true">*</span>
                }
              </label>
              <select
                id="tier"
                formControlName="tierId"
                appInput
                class="w-full sm:w-72"
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
              <select
                id="role"
                formControlName="role"
                appInput
                class="w-full sm:w-72"
              >
                <option value="manager">{{ listText.roleManager }}</option>
                <option value="admin">{{ listText.roleAdmin }}</option>
              </select>
            </div>
          }

          @if (isNew) {
            <p class="text-sm text-muted">{{ text.inviteHint }}</p>
          }

          @if (error()) {
            <p class="text-sm text-red-700" role="alert">{{ error() }}</p>
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
      </div>
    }
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
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly baseTierLabel = inject(ADMIN_TEXT).tierList.defaultLabel;

  protected readonly phoneInput = this.config.phoneInput;
  private readonly companyIdInput = this.config.companyIdInput;
  // Read out once: `companyIdInput?.x` inside a block that already tested it
  // trips NG8107.
  protected readonly companyIdPrefix = this.companyIdInput?.prefix;
  protected readonly companyIdMask = this.companyIdInput?.mask;
  protected readonly companyIdExample = this.companyIdInput?.example;

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

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, zodValidator(emailSchema, 'email')]],
    customerType: ['person' as CustomerType],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    // Optional, but a masked number still has to be whole: half a number is
    // the most likely way to end up with an unreachable customer.
    phone: [
      '',
      this.phoneInput?.mask ? [completeMask(this.phoneInput.mask)] : [],
    ],
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
        companyRegistrationId: typedCompanyId(
          user.companyRegistrationId,
          this.companyIdInput,
        ),
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

  // Segmented control: the selected kind fills with the theme primary.
  protected segClass(value: CustomerType): string {
    const base =
      'cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-secondary';
    const state =
      this.form.controls.customerType.value === value
        ? 'bg-primary text-white'
        : 'text-ink hover:bg-stone-100';
    return `${base} ${state}`;
  }

  protected companyIdHint(): string {
    return this.companyIdExample
      ? this.text.validation.companyIdFormat.replace(
          '{example}',
          this.companyIdExample,
        )
      : this.text.validation.companyIdRequired;
  }

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
        if (!approved.ok) return this.error.set(approved.message);
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
    this.error.set(result.message);
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
      companyRegistrationId: contact.companyRegistrationId ?? null,
      tierId: this.isCustomer() ? this.tierId() : null,
      // Sent only when this caller may set it, so a manager's save is never
      // refused for a field their form does not even show.
      ...(this.showsRole() ? { role: value.role } : {}),
    });
    if (result.ok) return result.user;
    this.error.set(result.message);
    return null;
  }

  /** `''` (only reachable before an approval) and the base list are both null. */
  private tierId(): string | null {
    const value = this.form.controls.tierId.value;
    return value && value !== 'default' ? value : null;
  }

  /** The two masked fields in the form the API stores them in. Omitted rather
   * than empty, since both are optional on creation. */
  private contactFields(): {
    phone?: string;
    companyRegistrationId?: string;
  } {
    const value = this.form.getRawValue();
    const phone = canonicalPhone(value.phone, this.phoneInput);
    const companyId =
      this.isCustomer() && value.customerType === 'company'
        ? canonicalCompanyId(value.companyRegistrationId, this.companyIdInput)
        : '';
    return {
      ...(phone ? { phone } : {}),
      ...(companyId ? { companyRegistrationId: companyId } : {}),
    };
  }

  /**
   * The registration number is required exactly when the account says it is a
   * company — the contract refuses it in the other direction too, so the field
   * is cleared rather than left holding a stale value.
   */
  private applyCompanyValidators(type: CustomerType): void {
    this.isCompany.set(this.isCustomer() && type === 'company');
    const control = this.form.controls.companyRegistrationId;
    if (this.isCompany()) {
      control.setValidators([
        Validators.required,
        ...(this.companyIdInput ? [companyIdPattern(this.companyIdInput)] : []),
        ...(this.companyIdMask ? [completeMask(this.companyIdMask)] : []),
      ]);
    } else {
      control.setValidators([]);
      control.setValue('', { emitEvent: false });
    }
    control.updateValueAndValidity({ emitEvent: false });
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
