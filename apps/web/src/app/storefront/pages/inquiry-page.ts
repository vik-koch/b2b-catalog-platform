import { Component, inject, signal } from '@angular/core';
import { form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { InquiryRequest } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { canonicalPhone } from '../../shared/core/contact-fields';
import { completeMask, emailAddress } from '../../shared/core/field-rules';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { Input } from '../../shared/ui/input';
import { PhoneInput } from '../../shared/ui/phone-input';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { InquiryService } from './inquiry.service';
import { ConsentField } from './consent-field';
import { useConsent } from './consent';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';

type PreferredContact = InquiryRequest['preferredContact'];
type Status = 'idle' | 'success' | 'error';

interface Inquiry {
  name: string;
  email: string;
  phone: string;
  preferredContact: PreferredContact;
  message: string;
  /** Honeypot. */
  website: string;
}

/**
 * Inquiry form (FR-NAV-06) — a code page, not a CMS Page. The visitor picks a
 * preferred contact channel and that channel's field becomes required.
 * The phone field's country code and mask come from deployment config.
 */
@Component({
  selector: 'app-inquiry-page',
  imports: [
    ConsentField,
    FORM_FIELDS,
    RouterLink,
    Button,
    Input,
    PhoneInput,
    Segmented,
    PageTitle,
    ErrorText,
  ],
  template: `
    <div class="max-w-xl">
      <h1 appPageTitle class="mb-2">{{ heading }}</h1>

      @if (status() === 'success') {
        <p class="text-ink-subtle">{{ text.success }}</p>
        <a appButton variant="secondary" routerLink="/" class="mt-8">
          {{ errors.notFoundBack }}
        </a>
      } @else {
        <p class="mb-4 text-ink-subtle">{{ text.intro }}</p>

        <form [formRoot]="form" class="space-y-6">
          <app-field
            [field]="form.name"
            [label]="fields.name.label"
            controlId="name"
          >
            <input
              type="text"
              appInput
              class="w-full"
              [formField]="form.name"
            />
          </app-field>

          <app-field-group
            [field]="form.preferredContact"
            [label]="text.preferredContact"
          >
            <app-segmented
              [options]="contactChannels"
              size="md"
              [formField]="form.preferredContact"
            />
          </app-field-group>

          <!-- Whichever channel was picked is the required one; the other stays
               offered, because a visitor who gives both is being helpful. -->
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

          <app-field
            [field]="form.message"
            [label]="text.message"
            controlId="message"
          >
            <textarea
              rows="5"
              appInput
              class="w-full"
              [formField]="form.message"
            ></textarea>
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
            <p appErrorText role="alert">{{ text.error }}</p>
          }

          <button appButton type="submit" [disabled]="form().submitting()">
            {{ form().submitting() ? actionText.sending : text.submit }}
          </button>
        </form>
      }
    </div>
  `,
})
export class InquiryPage {
  private readonly inquiry = inject(InquiryService);

  protected readonly text = inject(STOREFRONT_TEXT).inquiry;
  protected readonly fields = inject(SHARED_TEXT).fields;
  protected readonly contactChannels: readonly SegmentOption<PreferredContact>[] =
    [
      { value: 'email', label: this.text.preferredEmail },
      { value: 'phone', label: this.text.preferredPhone },
    ];
  protected readonly errors = inject(STOREFRONT_TEXT).errors;
  protected readonly heading = inject(SHARED_TEXT).nav['inquiry'];
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
  protected readonly status = signal<Status>('idle');
  protected readonly consent = useConsent('contact');

  protected readonly form = form(
    signal<Inquiry>({
      name: '',
      email: '',
      phone: '',
      preferredContact: 'email',
      message: '',
      website: '',
    }),
    (inquiry) => {
      required(inquiry.name, { message: this.fields.name.required });
      // The chosen channel is required; the other field stays optional. Both
      // keep their format rule either way: a number typed into the other field
      // is still going to be dialled, so half of one is no more use there.
      required(inquiry.email, {
        when: ({ valueOf }) => valueOf(inquiry.preferredContact) === 'email',
        message: this.fields.email.required,
      });
      emailAddress(inquiry.email, this.fields.email.invalid);
      required(inquiry.phone, {
        when: ({ valueOf }) => valueOf(inquiry.preferredContact) === 'phone',
        message: this.fields.phone.required,
      });
      completeMask(
        inquiry.phone,
        this.phoneInput?.mask,
        this.fields.phone.incomplete,
      );
    },
    // Named, or the generated control names count forms per server process.
    { name: 'inquiry', submission: { action: () => this.send() } },
  );

  private async send(): Promise<void> {
    if (this.consent.field().invalid() || !this.consent.sendable()) return;

    this.status.set('idle');
    const result = await this.inquiry.submit(this.toRequest());
    if (result === 'ok') {
      this.status.set('success');
      return;
    }
    // A consent refusal is explained beside the box, not as a failure.
    this.status.set(this.consent.refused(result) ? 'idle' : 'error');
  }

  private toRequest(): InquiryRequest {
    const value = this.form().value();

    return {
      name: value.name,
      email: value.email || undefined,
      phone: canonicalPhone(value.phone, this.phoneInput) || undefined,
      preferredContact: value.preferredContact,
      message: value.message || undefined,
      // Honeypot.
      website: value.website || undefined,
      consentVersion: this.consent.version(),
    };
  }
}
