import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerType, PartySuggestion } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { usePageSeo } from '../../shared/core/page-seo';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import {
  canonicalPhone,
  companyIdValidators,
  emailFormat,
  phoneValidators,
} from '../../shared/core/contact-fields';
import { FieldErrors } from '../../shared/core/form-errors';
import { CompanyFields } from '../../shared/parties/company-fields';
import { Button } from '../../shared/ui/button';
import { EmailField } from '../../shared/ui/email-field';
import { FieldLabel } from '../../shared/ui/field-label';
import { Input } from '../../shared/ui/input';
import { PhoneField } from '../../shared/ui/phone-field';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { AuthCard } from './auth-card';
import { AuthService } from '../../shared/auth/auth.service';
import { Link } from '../../shared/ui/link';
import { ConsentField } from '../pages/consent-field';
import { useConsent } from '../pages/consent';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';
import { PageIntro } from '../../shared/ui/page-intro';

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
    ConsentField,
    ReactiveFormsModule,
    RouterLink,
    Button,
    CompanyFields,
    EmailField,
    FieldLabel,
    Input,
    PhoneField,
    Segmented,
    Link,
    PageTitle,
    ErrorText,
    PageIntro,
  ],
  template: `
    <app-auth-card>
      @if (status() === 'success') {
        <h1 appPageTitle class="mb-4">
          {{ text.register.successHeading }}
        </h1>
        <p appPageIntro>{{ text.register.success }}</p>
        <a appButton variant="secondary" routerLink="/" class="mt-8">
          {{ home }}
        </a>
      } @else {
        <h1 appPageTitle class="mb-2">
          {{ text.register.heading }}
        </h1>
        <p appPageIntro class="mb-4">{{ text.register.intro }}</p>

        <form
          [formGroup]="form"
          (ngSubmit)="submit()"
          novalidate
          class="space-y-6"
        >
          <!-- Only where the shop sells to more than one kind of customer
               (FR-AUTH-13): with one, there is nothing to choose. -->
          @if (customerTypes.length > 1) {
            <fieldset>
              <legend appFieldLabel>{{ text.register.customerType }}</legend>
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
                {{ fields.firstName.label }}
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
                <p appErrorText class="mt-1">
                  {{ fields.firstName.required }}
                </p>
              }
            </div>

            <div>
              <label for="lastName" appFieldLabel>
                {{ fields.lastName.label }}
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
                <p appErrorText class="mt-1">
                  {{ fields.lastName.required }}
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
            [label]="fields.email.label"
            [text]="emailText"
            [required]="true"
            [invalid]="isInvalid('email')"
          />

          <app-phone-field
            [control]="form.controls.phone"
            [label]="fields.phone.label"
            [text]="phoneText"
            [required]="true"
            [invalid]="isInvalid('phone')"
          />

          <!-- Honeypot: hidden from humans. -->
          <div class="absolute left-[-9999px]" aria-hidden="true">
            <label for="website">Leave this field empty</label>
            <input
              id="website"
              type="text"
              formControlName="website"
              tabindex="-1"
              autocomplete="off"
            />
          </div>

          <app-consent-field
            [consent]="consent"
            [invalid]="fieldErrors.attempted() && consent.field().invalid()"
          />

          @if (status() === 'error') {
            <p appErrorText role="alert">
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
                ? actionText.sending
                : text.register.submit
            }}
          </button>
        </form>

        <p class="mt-8 text-sm text-ink-subtle">
          {{ text.register.haveAccount }}
          <a appLink routerLink="/login">{{ text.login }}</a>
        </p>
      }
    </app-auth-card>
  `,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(STOREFRONT_TEXT).auth;
  protected readonly fields = inject(SHARED_TEXT).fields;
  private readonly partyChoice = inject(STOREFRONT_TEXT).partyChoice;
  /**
   * The kinds of customer the shop sells to (FR-AUTH-13), in the order the
   * deployment lists them: the first is where the form starts.
   */
  protected readonly customerTypes: readonly SegmentOption<CustomerType>[] =
    this.config.customerTypes.map((value) => ({
      value,
      label: this.partyChoice[value],
    }));
  private readonly firstType = this.config.customerTypes[0];
  protected readonly home = inject(STOREFRONT_TEXT).errors.notFoundBack;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  private readonly phoneInput = this.config.phoneInput;
  private readonly companyIdInput = this.config.companyIdInput;

  // The wording each shared field puts under itself. Held as fields rather than
  // built in the template so the object identity is stable across change
  // detection.
  protected readonly emailText = {
    required: this.fields.email.required,
    invalid: this.fields.email.invalid,
  };
  protected readonly phoneText = {
    required: this.fields.phone.required,
    incomplete: this.fields.phone.incomplete,
  };
  protected readonly companyText = {
    idLabel: this.fields.companyId.label,
    nameLabel: this.fields.companyName.label,
    hint: this.text.register.companyIdHint,
    idFormat: this.fields.companyId.format,
    idRequired: this.fields.companyId.required,
    nameRequired: this.fields.companyName.required,
  };

  /** The company the registrant picked, if they picked one. */
  private readonly picked = signal<PartySuggestion | undefined>(undefined);

  protected readonly status = signal<Status>('idle');
  protected readonly consent = useConsent('account');
  protected readonly customerType = signal<CustomerType>(this.firstType);
  protected readonly isCompany = computed(
    () => this.customerType() === 'company',
  );

  protected readonly form = this.fb.nonNullable.group({
    customerType: [this.firstType],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    // The contract's own rule, so client and server agree on what a valid
    // address is.
    email: ['', [Validators.required, emailFormat()]],
    phone: ['', phoneValidators(this.phoneInput, true)],
    companyName: [''],
    companyRegistrationId: [''],
    website: [''],
  });

  constructor() {
    usePageSeo({ name: () => this.text.register.heading });

    this.applyValidators(this.firstType);
    this.form.controls.customerType.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((type) => {
        this.customerType.set(type);
        this.applyValidators(type);
      });
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
    if (
      this.form.invalid ||
      this.consent.field().invalid() ||
      !this.consent.sendable()
    ) {
      return;
    }

    this.status.set('submitting');
    const result = await this.auth.register(this.toRequest());
    if (result === 'ok') {
      this.status.set('success');
      return;
    }
    // A consent refusal is explained beside the box, not as a failure.
    this.status.set(this.consent.refused(result) ? 'idle' : 'error');
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
      consentVersion: this.consent.version(),
    };
  }
}
