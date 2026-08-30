import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { emailSchema, InquiryRequest } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { zodValidator } from '../core/zod-validator';
import { canonicalPhone, phoneValidators } from '../core/contact-fields';
import { FieldErrors } from '../core/form-errors';
import { Button } from '../ui/button';
import { EmailField } from '../ui/email-field';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { PhoneField } from '../ui/phone-field';
import { InquiryService } from './inquiry.service';
import { Checkbox } from '../ui/checkbox';

type PreferredContact = InquiryRequest['preferredContact'];
type Status = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Inquiry form (FR-NAV-06) — a code page, not a CMS Page. The visitor picks a
 * preferred contact channel and that channel's field becomes required.
 * The phone field's country code and mask come from deployment config.
 */
@Component({
  selector: 'app-inquiry-page',
  imports: [
    Checkbox,
    ReactiveFormsModule,
    RouterLink,
    Button,
    EmailField,
    FieldLabel,
    Input,
    PhoneField,
  ],
  template: `
    <div class="max-w-xl">
      <h1 class="mb-4 text-3xl font-medium tracking-tight">{{ heading }}</h1>

      @if (status() === 'success') {
        <p class="text-muted">{{ text.success }}</p>
        <a appButton variant="secondary" routerLink="/" class="mt-8">
          {{ errors.notFoundBack }}
        </a>
      } @else {
        <p class="mb-8 text-muted">{{ text.intro }}</p>

        <form
          [formGroup]="form"
          (ngSubmit)="submit()"
          novalidate
          class="space-y-6"
        >
          <div>
            <label for="name" appFieldLabel>
              {{ text.name }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            <input
              id="name"
              type="text"
              formControlName="name"
              aria-required="true"
              appInput
              class="w-full"
              [attr.aria-invalid]="isInvalid('name') || null"
            />
            @if (isInvalid('name')) {
              <p class="mt-1 text-sm text-red-600">
                {{ text.validation.nameRequired }}
              </p>
            }
          </div>

          <fieldset>
            <legend appFieldLabel>
              {{ text.preferredContact }}
            </legend>
            <div
              role="radiogroup"
              class="inline-flex gap-1 rounded-lg border border-border-strong bg-white p-1"
            >
              <label [class]="segClass('email')">
                <input
                  type="radio"
                  class="sr-only"
                  formControlName="preferredContact"
                  value="email"
                />
                {{ text.preferredEmail }}
              </label>
              <label [class]="segClass('phone')">
                <input
                  type="radio"
                  class="sr-only"
                  formControlName="preferredContact"
                  value="phone"
                />
                {{ text.preferredPhone }}
              </label>
            </div>
          </fieldset>

          <!-- Whichever channel was picked is the required one; the other stays
               offered, because a visitor who gives both is being helpful. -->
          <app-email-field
            [control]="form.controls.email"
            [label]="text.email"
            [text]="emailText"
            [required]="preferred() === 'email'"
            [invalid]="isInvalid('email')"
          />

          <app-phone-field
            [control]="form.controls.phone"
            [label]="text.phone"
            [text]="phoneText"
            [required]="preferred() === 'phone'"
            [invalid]="isInvalid('phone')"
          />

          <div>
            <label for="message" appFieldLabel>
              {{ text.message }}
            </label>
            <textarea
              id="message"
              rows="5"
              formControlName="message"
              appInput
              class="w-full"
            ></textarea>
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
              <!-- Sized explicitly so the nudge is exact: a 16px box in the 20px
                   line box of text-sm sits 2px down. At the browser's default
                   size (~13px) the same nudge reads as too high. -->
              <input
                type="checkbox"
                appCheckbox
                formControlName="acceptPrivacy"
                class="mt-0.5"
                aria-required="true"
                [attr.aria-invalid]="isInvalid('acceptPrivacy') || null"
              />
              <span>
                {{ text.privacyConsent }}
                <a routerLink="/privacy" class="text-primary underline">{{
                  text.privacyLink
                }}</a
                ><span class="text-accent" aria-hidden="true">*</span>
              </span>
            </label>
            @if (isInvalid('acceptPrivacy')) {
              <p class="mt-1 text-sm text-red-600">
                {{ text.validation.privacyRequired }}
              </p>
            }
          </div>

          @if (status() === 'error') {
            <p class="text-sm text-red-600" role="alert">{{ text.error }}</p>
          }

          <button
            appButton
            type="submit"
            [disabled]="status() === 'submitting'"
          >
            {{ status() === 'submitting' ? text.submitting : text.submit }}
          </button>
        </form>
      }
    </div>
  `,
})
export class InquiryPage {
  private readonly fb = inject(FormBuilder);
  private readonly inquiry = inject(InquiryService);

  protected readonly text = inject(APP_TEXT).inquiry;
  protected readonly errors = inject(APP_TEXT).errors;
  protected readonly heading = inject(APP_TEXT).nav['inquiry'];
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
  protected readonly emailText = {
    required: this.text.validation.emailRequired,
    invalid: this.text.validation.emailInvalid,
  };
  protected readonly phoneText = {
    required: this.text.validation.phoneRequired,
    incomplete: this.text.validation.phoneIncomplete,
  };
  protected readonly status = signal<Status>('idle');
  protected readonly preferred = signal<PreferredContact>('email');

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: [''],
    phone: [''],
    preferredContact: ['email' as PreferredContact],
    message: [''],
    // Honeypot.
    website: [''],
    acceptPrivacy: [false, Validators.requiredTrue],
  });

  constructor() {
    this.applyPreferredValidators(this.preferred());
    this.form.controls.preferredContact.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((preferred) => {
        this.preferred.set(preferred);
        this.applyPreferredValidators(preferred);
      });
  }

  // Segmented control: the selected channel fills with the theme primary.
  protected segClass(value: PreferredContact): string {
    // The radio itself is sr-only, so the focus treatment has to be borrowed by
    // its label — the app-wide outline cannot reach a hidden input's label on
    // its own. `has-[:focus-visible]` rather than `focus-within`: focusing a
    // radio by clicking it is still focus, so focus-within lit the ring up on
    // every mouse press. Same 2px secondary, flush, as everything else.
    const base =
      'cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-secondary';
    const state =
      this.preferred() === value
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
    try {
      await this.inquiry.submit(this.toRequest());
      this.status.set('success');
    } catch {
      this.status.set('error');
    }
  }

  // The chosen channel is required; the other field stays optional. Email keeps
  // the shared contract's format check either way; a masked phone must also be
  // complete. `emailFormat` is the contract's own rule, so client and server
  // agree on what a valid address is.
  private applyPreferredValidators(preferred: PreferredContact): void {
    const { email, phone } = this.form.controls;
    const emailFormat = zodValidator(emailSchema, 'email');

    // Completeness applies either way: the chosen channel must be filled in,
    // but a number typed into the *other* field is still going to be dialled,
    // so half of one is no more use there than here.
    phone.setValidators(
      phoneValidators(this.phoneInput, preferred === 'phone'),
    );
    email.setValidators(
      preferred === 'email'
        ? [Validators.required, emailFormat]
        : [emailFormat],
    );

    email.updateValueAndValidity({ emitEvent: false });
    phone.updateValueAndValidity({ emitEvent: false });
  }

  private toRequest(): InquiryRequest {
    const value = this.form.getRawValue();

    return {
      name: value.name,
      email: value.email || undefined,
      phone: canonicalPhone(value.phone, this.phoneInput) || undefined,
      preferredContact: value.preferredContact,
      message: value.message || undefined,
      // Honeypot.
      website: value.website || undefined,
    };
  }
}
