import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerType, emailSchema } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import {
  canonicalCompanyId,
  canonicalPhone,
  companyIdValidators,
  phoneValidators,
  type CompanyIdFormat,
} from '../core/contact-fields';
import { FieldErrors } from '../core/form-errors';
import { zodValidator } from '../core/zod-validator';
import { AuthCard } from './auth-card';
import { Button } from '../ui/button';
import { CompanyIdField } from '../ui/company-id-field';
import { EmailField } from '../ui/email-field';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { PhoneField } from '../ui/phone-field';
import { AuthService } from './auth.service';

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
    AuthCard,
    ReactiveFormsModule,
    RouterLink,
    Button,
    CompanyIdField,
    EmailField,
    FieldLabel,
    Input,
    PhoneField,
  ],
  template: `
    <app-auth-card>
      @if (status() === 'success') {
        <h1 class="mb-4 text-3xl font-bold tracking-tight">
          {{ text.register.successHeading }}
        </h1>
        <p class="text-muted">{{ text.register.success }}</p>
        <a appButton variant="secondary" routerLink="/" class="mt-8">
          {{ home }}
        </a>
      } @else {
        <h1 class="mb-4 text-3xl font-bold tracking-tight">
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
            <app-company-id-field
              [control]="form.controls.companyRegistrationId"
              [formatControl]="form.controls.companyIdFormat"
              [label]="text.register.companyId"
              [text]="companyIdText"
              [invalid]="isInvalid('companyRegistrationId')"
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
                formControlName="acceptPrivacy"
                class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
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
  protected readonly companyIdText = {
    required: this.text.register.validation.companyIdRequired,
    format: this.text.register.validation.companyIdFormat,
    formatLabel: this.text.register.companyIdFormat,
  };

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
    companyRegistrationId: [''],
    // Which shape the number is being entered in. Never sent — it decides the
    // prefix, the mask and the rule, and the stored value is the result.
    companyIdFormat: [this.companyIdInput?.formats[0]?.key ?? ''],
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
    // A different shape is a different rule, so the validators follow the
    // picker as well as the account type.
    this.form.controls.companyIdFormat.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applyValidators(this.customerType()));
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
   * The registration number is required exactly when the applicant says they
   * are a company — the contract refuses it in the other direction too, so the
   * field is cleared rather than left holding a stale value.
   */
  private applyValidators(type: CustomerType): void {
    const control = this.form.controls.companyRegistrationId;
    if (type === 'company') {
      control.setValidators(companyIdValidators(this.chosenFormat()));
    } else {
      control.setValidators([]);
      control.setValue('', { emitEvent: false });
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  /** The shape the applicant said they were entering. */
  private chosenFormat(): CompanyIdFormat | undefined {
    const key = this.form.controls.companyIdFormat.value;
    return this.companyIdInput?.formats.find((format) => format.key === key);
  }

  private toRequest() {
    const value = this.form.getRawValue();

    return {
      email: value.email,
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      phone: canonicalPhone(value.phone, this.phoneInput),
      customerType: value.customerType,
      companyRegistrationId:
        value.customerType === 'company'
          ? canonicalCompanyId(value.companyRegistrationId, this.chosenFormat())
          : undefined,
      // Honeypot.
      website: value.website || undefined,
    };
  }
}
