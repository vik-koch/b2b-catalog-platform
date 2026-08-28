import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CustomerType,
  emailSchema,
  PartySuggestion,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import {
  canonicalPhone,
  companyIdValidators,
  phoneValidators,
} from '../core/contact-fields';
import { FieldErrors } from '../core/form-errors';
import { zodValidator } from '../core/zod-validator';
import { AuthCard } from './auth-card';
import { Button } from '../ui/button';
import { CompanyFields } from '../parties/company-fields';
import { EmailField } from '../ui/email-field';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { PhoneField } from '../ui/phone-field';
import { AuthService } from './auth.service';
import { Checkbox } from '../ui/checkbox';

type Status = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Self-registration (FR-AUTH-01). A registration is a *request* to become a
 * customer, and the staff member who decides on it has no way to ask the
 * applicant anything — a pending account cannot sign in. So the form collects
 * what makes that decision possible: who this is, a number to verify them on,
 * and, for a business, the registration number staff match against their own
 * records. The copy says a person reviews it, so the wait is expected rather
 * than read as a broken signup.
 *
 * The success message is deliberately non-committal ("if we can set up an
 * account for this address"), because the server answers the same way for an
 * address that already has one. Saying more here would leak what the API
 * carefully does not.
 */
@Component({
  selector: 'app-register-page',
  imports: [
    Checkbox,
    AuthCard,
    ReactiveFormsModule,
    RouterLink,
    Button,
    CompanyFields,
    EmailField,
    FieldLabel,
    Input,
    PhoneField,
  ],
  template: `
    <app-auth-card>
      @if (status() === 'success') {
        <h1 class="mb-4 text-3xl font-medium tracking-tight">
          {{ text.register.successHeading }}
        </h1>
        <p class="text-muted">{{ text.register.success }}</p>
        <a appButton variant="secondary" routerLink="/" class="mt-8">
          {{ home }}
        </a>
      } @else {
        <h1 class="mb-4 text-3xl font-medium tracking-tight">
          {{ text.register.heading }}
        </h1>
        <p class="mb-8 text-muted">{{ text.register.intro }}</p>

        <form
          [formGroup]="form"
          (ngSubmit)="submit()"
          novalidate
          class="space-y-6"
        >
          <fieldset>
            <legend appFieldLabel>{{ text.register.customerType }}</legend>
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
                {{ text.register.person }}
              </label>
              <label [class]="segClass('company')">
                <input
                  type="radio"
                  class="sr-only"
                  formControlName="customerType"
                  value="company"
                />
                {{ text.register.company }}
              </label>
            </div>
          </fieldset>

          <div class="grid gap-6 sm:grid-cols-2">
            <div>
              <label for="firstName" appFieldLabel>
                {{ text.register.firstName }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <input
                id="firstName"
                type="text"
                formControlName="firstName"
                autocomplete="given-name"
                aria-required="true"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('firstName') || null"
              />
              @if (isInvalid('firstName')) {
                <p class="mt-1 text-sm text-red-600">
                  {{ text.register.validation.firstNameRequired }}
                </p>
              }
            </div>

            <div>
              <label for="lastName" appFieldLabel>
                {{ text.register.lastName }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <input
                id="lastName"
                type="text"
                formControlName="lastName"
                autocomplete="family-name"
                aria-required="true"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('lastName') || null"
              />
              @if (isInvalid('lastName')) {
                <p class="mt-1 text-sm text-red-600">
                  {{ text.register.validation.lastNameRequired }}
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
              (picked)="fillFrom($event)"
            />
          }

          <app-email-field
            [control]="form.controls.email"
            [label]="text.email"
            [text]="emailText"
            [required]="true"
            [invalid]="isInvalid('email')"
          />

          <app-phone-field
            [control]="form.controls.phone"
            [label]="text.register.phone"
            [text]="phoneText"
            [required]="true"
            [invalid]="isInvalid('phone')"
          />

          <!-- Honeypot: hidden from humans. -->
          <div class="absolute -left-[9999px]" aria-hidden="true">
            <label for="website">Leave this field empty</label>
            <input
              id="website"
              type="text"
              formControlName="website"
              tabindex="-1"
              autocomplete="off"
            />
          </div>

          <div>
            <label class="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                appCheckbox
                formControlName="acceptPrivacy"
                class="mt-0.5"
                aria-required="true"
                [attr.aria-invalid]="isInvalid('acceptPrivacy') || null"
              />
              <span>
                {{ text.register.privacyConsent }}
                <a routerLink="/privacy" class="text-primary underline">{{
                  text.register.privacyLink
                }}</a
                ><span class="text-accent" aria-hidden="true">*</span>
              </span>
            </label>
            @if (isInvalid('acceptPrivacy')) {
              <p class="mt-1 text-sm text-red-600">
                {{ text.register.validation.privacyRequired }}
              </p>
            }
          </div>

          @if (status() === 'error') {
            <p class="text-sm text-red-600" role="alert">
              {{ text.register.error }}
            </p>
          }

          <button
            appButton
            type="submit"
            [disabled]="status() === 'submitting'"
          >
            {{
              status() === 'submitting'
                ? text.register.submitting
                : text.register.submit
            }}
          </button>
        </form>

        <p class="mt-8 text-sm text-muted">
          {{ text.register.haveAccount }}
          <a routerLink="/login" class="text-primary underline">{{
            text.login
          }}</a>
        </p>
      }
    </app-auth-card>
  `,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(APP_TEXT).auth;
  protected readonly home = inject(APP_TEXT).errors.notFoundBack;
  private readonly phoneInput = this.config.phoneInput;
  private readonly companyIdInput = this.config.companyIdInput;

  // The wording each shared field puts under itself. Held as fields rather than
  // built in the template so the object identity is stable across change
  // detection.
  protected readonly emailText = {
    required: this.text.validation.emailRequired,
    invalid: this.text.validation.emailInvalid,
  };
  protected readonly phoneText = {
    required: this.text.register.validation.phoneRequired,
    incomplete: this.text.register.validation.phoneIncomplete,
  };
  protected readonly companyText = {
    ...this.text.register.companySuggest,
    idLabel: this.text.register.companyId,
    nameLabel: this.text.register.companyName,
    hint: this.text.register.companyIdHint,
    idFormat: this.text.register.validation.companyIdFormat,
    idRequired: this.text.register.validation.companyIdRequired,
    nameRequired: this.text.register.validation.companyNameRequired,
  };

  /** The company the registrant picked, if they picked one. */
  private readonly picked = signal<PartySuggestion | undefined>(undefined);

  protected readonly status = signal<Status>('idle');
  protected readonly customerType = signal<CustomerType>('person');
  protected readonly isCompany = computed(
    () => this.customerType() === 'company',
  );

  protected readonly form = this.fb.nonNullable.group({
    customerType: ['person' as CustomerType],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    // The contract's own rule, so client and server agree on what a valid
    // address is.
    email: ['', [Validators.required, zodValidator(emailSchema, 'email')]],
    phone: ['', phoneValidators(this.phoneInput, true)],
    companyName: [''],
    companyRegistrationId: [''],
    website: [''],
    acceptPrivacy: [false, Validators.requiredTrue],
  });

  constructor() {
    this.applyValidators('person');
    this.form.controls.customerType.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((type) => {
        this.customerType.set(type);
        this.applyValidators(type);
      });
  }

  // Segmented control: the selected kind fills with the theme primary.
  protected segClass(value: CustomerType): string {
    const base =
      'cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-secondary';
    const state =
      this.customerType() === value
        ? 'bg-primary text-white'
        : 'text-ink hover:bg-stone-100';
    return `${base} ${state}`;
  }

  /**
   * Error visibility, not validity: revealed on blur, hidden again while the
   * field is being retyped, and everything shown once submit is attempted.
   */
  protected readonly fieldErrors = new FieldErrors(this.form);

  protected isInvalid(control: keyof typeof this.form.controls): boolean {
    return this.fieldErrors.show(this.form.controls[control]);
  }

  protected async submit(): Promise<void> {
    this.fieldErrors.markSubmitted();
    if (this.form.invalid) {
      return;
    }

    this.status.set('submitting');
    const result = await this.auth.register(this.toRequest());
    this.status.set(result === 'ok' ? 'success' : 'error');
  }

  /**
   * The company fields are required exactly when the applicant says they are a
   * company — the contract refuses them in the other direction too, so they are
   * cleared rather than left holding a stale value.
   */
  private applyValidators(type: CustomerType): void {
    const isCompany = type === 'company';
    const fields = [
      [this.form.controls.companyName, [Validators.required]],
      [
        this.form.controls.companyRegistrationId,
        companyIdValidators(this.companyIdInput?.formats),
      ],
    ] as const;

    for (const [control, validators] of fields) {
      control.setValidators(isCompany ? [...validators] : []);
      if (!isCompany) control.setValue('', { emitEvent: false });
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  /**
   * A picked company, spread across both fields. Only what the provider
   * actually answered is written — a partial answer must not blank what the
   * customer already typed — and neither value is locked afterwards: the
   * registry fills the form, it does not decide it (ADR 0041).
   */
  protected fillFrom(party: PartySuggestion): void {
    this.form.patchValue({
      companyName: party.name,
      ...(party.registrationId
        ? { companyRegistrationId: party.registrationId }
        : {}),
    });
    // Kept for the submission, not shown: the registered address becomes the
    // account's first saved one (FR-AUTH-10), and a registration form is no
    // place to review an address nobody asked to enter.
    this.picked.set(party);
  }

  /**
   * The picked company's registered address, where it still describes what is
   * in the form. A registrant who picked a suggestion and then typed a
   * different company over it is not offering that company's address, so the
   * name has to still match.
   */
  private billingAddress(customerType: CustomerType) {
    const party = this.picked();
    const typed = this.form.controls.companyName.value.trim();
    if (customerType !== 'company' || !party?.address || party.name !== typed) {
      return undefined;
    }
    return { ...party.address, entityType: party.entityType ?? 'individual' };
  }

  private toRequest() {
    const value = this.form.getRawValue();

    return {
      email: value.email,
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      phone: canonicalPhone(value.phone, this.phoneInput),
      customerType: value.customerType,
      companyName:
        value.customerType === 'company' ? value.companyName.trim() : undefined,
      // Sent as typed; the contract normalizes it (spaces out, upper case) so
      // the browser and the API cannot disagree about what was entered.
      companyRegistrationId:
        value.customerType === 'company'
          ? value.companyRegistrationId.trim()
          : undefined,
      // Only where it is the address of the company that was picked, and only
      // for a company: everything else about this request is typed, and this is
      // the one thing that is chosen.
      billingAddress: this.billingAddress(value.customerType),
      // Honeypot.
      website: value.website || undefined,
    };
  }
}
