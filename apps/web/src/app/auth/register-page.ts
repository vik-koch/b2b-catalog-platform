import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerType, emailSchema } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { zodValidator } from '../core/zod-validator';
import { Button } from '../ui/button';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { DigitMask } from '../ui/digit-mask';
import { AuthService } from './auth.service';

type Status = 'idle' | 'submitting' | 'success' | 'error';

const digits = (value: string | null | undefined): string =>
  (value ?? '').replace(/\D/g, '');

// A masked number must be filled to its full length; empty is left to the
// `required` validator so the two errors stay distinct.
const completeMasked = (mask: string): ValidatorFn => {
  const expected = (mask.match(/#/g) ?? []).length;
  return (control) => {
    const entered = digits(control.value);
    return !entered || entered.length === expected
      ? null
      : { incomplete: true };
  };
};

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
    ReactiveFormsModule,
    RouterLink,
    Button,
    FieldLabel,
    Input,
    DigitMask,
  ],
  template: `
    <div class="mx-auto max-w-xl">
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
            <div>
              <label for="companyRegistrationId" appFieldLabel>
                {{ text.register.companyId }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <div class="flex">
                @if (companyIdInput?.prefix) {
                  <span
                    class="inline-flex items-center rounded-l-md border border-r-0 border-border-strong bg-stone-100 px-3 text-muted"
                  >
                    {{ companyIdInput?.prefix }}
                  </span>
                }
                @if (companyIdInput?.mask) {
                  <input
                    id="companyRegistrationId"
                    type="text"
                    appDigitMask
                    [mask]="companyIdInput?.mask ?? ''"
                    formControlName="companyRegistrationId"
                    inputmode="numeric"
                    aria-required="true"
                    appInput
                    class="w-full"
                    [class.rounded-l-none]="!!companyIdInput?.prefix"
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
                    [class.rounded-l-none]="!!companyIdInput?.prefix"
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
                      ? text.register.validation.companyIdRequired
                      : companyIdHint()
                  }}
                </p>
              } @else if (companyIdInput?.example) {
                <p class="mt-1 text-sm text-muted">{{ companyIdHint() }}</p>
              }
            </div>
          }

          <div>
            <label for="email" appFieldLabel>
              {{ text.email }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            <input
              id="email"
              type="email"
              formControlName="email"
              autocomplete="email"
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

          <div>
            <label for="phone" appFieldLabel>
              {{ text.register.phone }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            @if (phoneInput) {
              <div class="flex">
                <span
                  class="inline-flex items-center rounded-l-md border border-r-0 border-border-strong bg-stone-100 px-3 text-muted"
                >
                  {{ phoneInput.countryCode }}
                </span>
                <input
                  id="phone"
                  type="tel"
                  appDigitMask
                  [mask]="phoneInput.mask ?? ''"
                  formControlName="phone"
                  autocomplete="tel"
                  aria-required="true"
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
                autocomplete="tel"
                aria-required="true"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('phone') || null"
              />
            }
            @if (isInvalid('phone')) {
              <p class="mt-1 text-sm text-red-600">
                {{
                  form.controls.phone.hasError('required')
                    ? text.register.validation.phoneRequired
                    : text.register.validation.phoneIncomplete
                }}
              </p>
            }
          </div>

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
    </div>
  `,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(APP_TEXT).auth;
  protected readonly home = inject(APP_TEXT).errors.notFoundBack;
  protected readonly phoneInput = this.config.phoneInput;
  protected readonly companyIdInput = this.config.companyIdInput;
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
    phone: ['', Validators.required],
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

  /** The format hint, worded from the deployment's own example. */
  protected companyIdHint(): string {
    const example = this.companyIdInput?.example;
    return example
      ? this.text.register.validation.companyIdFormat.replace(
          '{example}',
          example,
        )
      : this.text.register.validation.companyIdRequired;
  }

  protected isInvalid(control: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
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
      const pattern = this.companyIdInput?.pattern;
      const mask = this.companyIdInput?.mask;
      control.setValidators([
        Validators.required,
        // The deployment's own rule, applied to the value as it will be sent.
        ...(pattern ? [this.canonicalPattern(pattern)] : []),
        ...(mask ? [completeMasked(mask)] : []),
      ]);
    } else {
      control.setValidators([]);
      control.setValue('', { emitEvent: false });
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  // Validates the canonical (unmasked) value, which is what the server sees.
  private canonicalPattern(pattern: string): ValidatorFn {
    const regex = new RegExp(pattern);
    return (control) => {
      const value = this.canonicalCompanyId(String(control.value ?? ''));
      return !value || regex.test(value) ? null : { companyIdFormat: true };
    };
  }

  /**
   * What actually travels and gets stored. A configured mask only groups digits
   * for readability, and a configured prefix (a VAT country code) is shown
   * rather than typed — so both are resolved here into the one canonical form
   * the deployment's pattern describes and the shop's own records use.
   */
  private canonicalCompanyId(value: string): string {
    const typed = this.companyIdInput?.mask ? digits(value) : value.trim();
    return typed ? `${this.companyIdInput?.prefix ?? ''}${typed}` : '';
  }

  private toRequest() {
    const value = this.form.getRawValue();
    const national = value.phone.trim();
    const phone = this.phoneInput
      ? `${this.phoneInput.countryCode} ${national}`
      : national;

    return {
      email: value.email,
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      phone,
      customerType: value.customerType,
      companyRegistrationId:
        value.customerType === 'company'
          ? this.canonicalCompanyId(value.companyRegistrationId)
          : undefined,
      // Honeypot.
      website: value.website || undefined,
    };
  }
}
