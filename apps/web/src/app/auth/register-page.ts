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
  companyIdPattern,
} from '../core/contact-fields';
import { FieldErrors } from '../core/form-errors';
import { completeMask } from '../core/masked-input';
import { zodValidator } from '../core/zod-validator';
import { Button } from '../ui/button';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { DigitMask } from '../ui/digit-mask';
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
                      ? text.register.validation.companyIdRequired
                      : companyIdHint()
                  }}
                </p>
              } @else if (companyIdExample) {
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
  private readonly companyIdInput = this.config.companyIdInput;
  // Read out once: the template narrows each optional access otherwise, and
  // `companyIdInput?.x` inside a block that already tested it trips NG8107.
  protected readonly companyIdPrefix = this.companyIdInput?.prefix;
  protected readonly companyIdMask = this.companyIdInput?.mask;
  protected readonly companyIdExample = this.companyIdInput?.example;
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
    // A masked number has to be *complete*, not merely non-empty: the mask
    // says how many digits this deployment expects, and half of them is the
    // most likely way to get an unreachable customer.
    phone: [
      '',
      this.phoneInput?.mask
        ? [Validators.required, completeMask(this.phoneInput.mask)]
        : [Validators.required],
    ],
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
    return this.companyIdExample
      ? this.text.register.validation.companyIdFormat.replace(
          '{example}',
          this.companyIdExample,
        )
      : this.text.register.validation.companyIdRequired;
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
      control.setValidators([
        Validators.required,
        // The deployment's own rule, applied to the value as it will be sent.
        ...(this.companyIdInput ? [companyIdPattern(this.companyIdInput)] : []),
        ...(this.companyIdMask ? [completeMask(this.companyIdMask)] : []),
      ]);
    } else {
      control.setValidators([]);
      control.setValue('', { emitEvent: false });
    }
    control.updateValueAndValidity({ emitEvent: false });
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
          ? canonicalCompanyId(value.companyRegistrationId, this.companyIdInput)
          : undefined,
      // Honeypot.
      website: value.website || undefined,
    };
  }
}
