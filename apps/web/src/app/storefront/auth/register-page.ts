import { Component, computed, inject, signal } from '@angular/core';
import { form, hidden, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { CustomerType, PartySuggestion } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { usePageSeo } from '../../shared/core/page-seo';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { canonicalPhone } from '../../shared/core/contact-fields';
import {
  companyIdFormat,
  completeMask,
  emailAddress,
} from '../../shared/core/field-rules';
import { CompanyFields } from '../../shared/parties/company-fields';
import { Button } from '../../shared/ui/button';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { Input } from '../../shared/ui/input';
import { PhoneInput } from '../../shared/ui/phone-input';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { AuthCard } from './auth-card';
import { AuthService } from '../../shared/auth/auth.service';
import { Link } from '../../shared/ui/link';
import { ConsentField } from '../pages/consent-field';
import { useConsent } from '../pages/consent';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';
import { PageIntro } from '../../shared/ui/page-intro';

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

        <form [formRoot]="form" class="space-y-6">
          <!-- Only where the shop sells to more than one kind of customer
               (FR-AUTH-13): with one, there is nothing to choose. -->
          @if (customerTypes.length > 1) {
            <app-field-group
              [field]="form.customerType"
              [label]="text.register.customerType"
            >
              <app-segmented
                [options]="customerTypes"
                size="md"
                [formField]="form.customerType"
              />
            </app-field-group>
          }

          <div class="grid gap-6 sm:grid-cols-2">
            <app-field
              [field]="form.firstName"
              [label]="fields.firstName.label"
              controlId="firstName"
            >
              <input
                type="text"
                autocomplete="given-name"
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
                autocomplete="family-name"
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
              (picked)="fillFrom($event)"
            />
          }

          <app-field
            [field]="form.email"
            [label]="fields.email.label"
            controlId="email"
          >
            <input
              type="email"
              autocomplete="email"
              appInput
              class="w-full"
              [formField]="form.email"
            />
          </app-field>

          <app-field
            [field]="form.phone"
            [label]="fields.phone.label"
            controlId="phone"
          >
            <app-phone-input [field]="form.phone" [phone]="phoneInput" />
          </app-field>

          <!-- Honeypot: hidden from humans. -->
          <div class="absolute left-[-9999px]" aria-hidden="true">
            <label for="website">Leave this field empty</label>
            <input
              id="website"
              type="text"
              [formField]="form.website"
              tabindex="-1"
              autocomplete="off"
            />
          </div>

          <app-consent-field [consent]="consent" />

          @if (status() === 'error') {
            <p appErrorText role="alert">
              {{ text.register.error }}
            </p>
          }

          <button appButton type="submit" [disabled]="form().submitting()">
            {{
              form().submitting() ? actionText.sending : text.register.submit
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
  protected readonly phoneInput = this.config.phoneInput;
  private readonly companyIdInput = this.config.companyIdInput;

  // Held as a field rather than built in the template, so its identity is
  // stable across change detection.
  protected readonly companyText = {
    idLabel: this.fields.companyId.label,
    nameLabel: this.fields.companyName.label,
    hint: this.text.register.companyIdHint,
  };

  /** The company the registrant picked, if they picked one. */
  private readonly picked = signal<PartySuggestion | undefined>(undefined);

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

      // The company is asked of a company only. Hidden, its fields count for
      // nothing, and whatever was typed is kept for a change of mind but
      // never sent (see toRequest).
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

  /**
   * A picked company, spread across both fields. Only what the provider
   * actually answered is written — a partial answer must not blank what the
   * customer already typed — and neither value is locked afterwards: the
   * registry fills the form, it does not decide it (ADR 0041).
   */
  protected fillFrom(party: PartySuggestion): void {
    this.form.companyName().value.set(party.name);
    if (party.registrationId) {
      this.form.companyRegistrationId().value.set(party.registrationId);
    }
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
