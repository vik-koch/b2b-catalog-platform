import { Component, computed, inject, signal } from '@angular/core';
import { form, hidden, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { usePageSeo } from '../../../platform/page-seo';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { canonicalPhone } from '../../../platform/contact-fields';
import { completeMask, emailAddress } from '../../../platform/field-rules';
import { CompanyFields } from '../../../core/accounts/parties/company-fields';
import { companyIdFormat } from '../../../core/accounts/parties/company-id';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { HoneypotField } from '@b2b-catalog-platform/ui/fields/honeypot-field';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { PhoneInput } from '@b2b-catalog-platform/ui/inputs/phone-input';
import {
  Segmented,
  SegmentOption,
} from '@b2b-catalog-platform/ui/choices/segmented';
import { AuthCard } from './auth-card';
import { SignInService } from './sign-in.service';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { ConsentField } from '../../site/consent-field';
import { useConsent } from '../../site/consent';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { Outcome } from '@b2b-catalog-platform/ui/content/outcome';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';
import {
  CustomerType,
  PartySuggestion,
} from '@b2b-catalog-platform/shared/core/accounts';

type Status = 'idle' | 'success' | 'error';

interface Registration {
  customerType: CustomerType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  companyRegistrationId: string;
  /** Honeypot. */
  website: string;
}

/**
 * A request to become a customer, decided by staff who cannot ask the
 * applicant anything, so it collects what that decision needs. The success
 * is non-committal: the server answers the same for a taken address.
 */
@Component({
  selector: 'app-register-page',
  imports: [
    Outcome,
    HoneypotField,
    AuthCard,
    ConsentField,
    FORM_FIELDS,
    RouterLink,
    Button,
    CompanyFields,
    Input,
    PhoneInput,
    Segmented,
    Link,
    PageTitle,
    ErrorText,
    PageIntro,
  ],
  template: `
    <app-auth-card>
      @if (status() === 'success') {
        <ui-outcome
          [title]="text.register.successHeading"
          [message]="text.register.success"
        >
          <a uiButton variant="secondary" routerLink="/">{{ home }}</a>
        </ui-outcome>
      } @else {
        <h1 uiPageTitle class="mb-2">
          {{ text.register.heading }}
        </h1>
        <p uiPageIntro class="mb-4">{{ text.register.intro }}</p>

        <form [formRoot]="form" class="space-y-6">
          <!-- Only where the shop sells to more than one kind of customer
               (FR-AUTH-13): with one, there is nothing to choose. -->
          @if (customerTypes.length > 1) {
            <ui-field-group
              [field]="form.customerType"
              [label]="text.register.customerType"
            >
              <ui-segmented
                [options]="customerTypes"
                size="md"
                [formField]="form.customerType"
              />
            </ui-field-group>
          }

          <div class="grid gap-6 sm:grid-cols-2">
            <ui-field
              [field]="form.firstName"
              [label]="fields.firstName.label"
              controlId="firstName"
            >
              <input
                type="text"
                autocomplete="given-name"
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
                autocomplete="family-name"
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
              [hint]="text.register.companyIdHint"
              (picked)="picked.set($event)"
            />
          }

          <ui-field
            [field]="form.email"
            [label]="fields.email.label"
            controlId="email"
          >
            <input
              type="email"
              autocomplete="email"
              uiInput
              class="w-full"
              [formField]="form.email"
            />
          </ui-field>

          <ui-field
            [field]="form.phone"
            [label]="fields.phone.label"
            controlId="phone"
          >
            <ui-phone-input [field]="form.phone" [phone]="phoneInput" />
          </ui-field>

          <ui-honeypot-field
            controlId="website"
            [field]="form.website"
            label="Leave this field empty"
          />

          <app-consent-field [consent]="consent" />

          @if (status() === 'error') {
            <p uiErrorText role="alert">
              {{ text.register.error }}
            </p>
          }

          <button uiButton type="submit" [disabled]="form().submitting()">
            {{
              form().submitting() ? actionText.sending : text.register.submit
            }}
          </button>
        </form>

        <p class="mt-8 text-sm text-ink-subtle">
          {{ text.register.haveAccount }}
          <a uiLink routerLink="/login">{{ text.login }}</a>
        </p>
      }
    </app-auth-card>
  `,
})
export class RegisterPage {
  private readonly auth = inject(SignInService);
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(STOREFRONT_TEXT).auth;
  protected readonly fields = inject(SHARED_TEXT).fields;
  private readonly partyChoice = inject(STOREFRONT_TEXT).partyChoice;
  /** In the deployment's order: the first is where the form starts. */
  protected readonly customerTypes: readonly SegmentOption<CustomerType>[] =
    this.config.customerTypes.map((value) => ({
      value,
      label: this.partyChoice[value],
    }));
  private readonly firstType = this.config.customerTypes[0];
  protected readonly home = inject(STOREFRONT_TEXT).errors.notFoundBack;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly phoneInput = this.config.phoneInput;
  private readonly companyIdInput = this.config.companyIdInput;

  /** Kept for its registered address, which becomes the account's first
   * saved one without being shown here. */
  protected readonly picked = signal<PartySuggestion | undefined>(undefined);

  protected readonly status = signal<Status>('idle');
  protected readonly consent = useConsent('account');
  private readonly model = signal<Registration>({
    customerType: this.firstType,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    companyName: '',
    companyRegistrationId: '',
    website: '',
  });
  protected readonly form = form(
    this.model,
    (registration) => {
      required(registration.firstName, {
        message: this.fields.firstName.required,
      });
      required(registration.lastName, {
        message: this.fields.lastName.required,
      });
      required(registration.email, { message: this.fields.email.required });
      emailAddress(registration.email, this.fields.email.invalid);
      required(registration.phone, { message: this.fields.phone.required });
      completeMask(
        registration.phone,
        this.phoneInput?.mask,
        this.fields.phone.incomplete,
      );

      // Hidden fields count for nothing; typed values stay for a change of
      // mind but are never sent.
      hidden(registration.companyName, {
        when: ({ valueOf }) => valueOf(registration.customerType) !== 'company',
      });
      hidden(registration.companyRegistrationId, {
        when: ({ valueOf }) => valueOf(registration.customerType) !== 'company',
      });
      required(registration.companyName, {
        message: this.fields.companyName.required,
      });
      required(registration.companyRegistrationId, {
        message: this.fields.companyId.required,
      });
      companyIdFormat(
        registration.companyRegistrationId,
        this.companyIdInput?.formats,
        this.fields.companyId.format,
      );
    },
    { name: 'register', submission: { action: () => this.send() } },
  );
  protected readonly isCompany = computed(
    () => this.form.customerType().value() === 'company',
  );

  constructor() {
    usePageSeo({ name: () => this.text.register.heading });
  }

  private async send(): Promise<void> {
    if (this.consent.field().invalid() || !this.consent.sendable()) return;

    this.status.set('idle');
    const result = await this.auth.register(this.toRequest());
    if (result === 'ok') {
      this.status.set('success');
      return;
    }
    // A consent refusal is explained beside the box, not as a failure.
    this.status.set(this.consent.refused(result) ? 'idle' : 'error');
  }

  /** Only while the typed name is still the picked company's. */
  private billingAddress(customerType: CustomerType) {
    const party = this.picked();
    const typed = this.model().companyName.trim();
    if (customerType !== 'company' || !party?.address || party.name !== typed) {
      return undefined;
    }
    return { ...party.address, entityType: party.entityType ?? 'individual' };
  }

  private toRequest() {
    const value = this.model();

    return {
      email: value.email,
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      phone: canonicalPhone(value.phone, this.phoneInput),
      customerType: value.customerType,
      companyName:
        value.customerType === 'company' ? value.companyName.trim() : undefined,
      // Sent as typed: the contract normalizes it.
      companyRegistrationId:
        value.customerType === 'company'
          ? value.companyRegistrationId.trim()
          : undefined,
      billingAddress: this.billingAddress(value.customerType),
      website: value.website || undefined,
      consentVersion: this.consent.version(),
    };
  }
}
