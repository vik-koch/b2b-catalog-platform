import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { emailSchema, InquiryRequest } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { zodValidator } from '../core/zod-validator';
import { Button } from '../ui/button';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { PhoneMask } from '../ui/phone-mask';
import { InquiryService } from './inquiry.service';

type PreferredContact = InquiryRequest['preferredContact'];
type Status = 'idle' | 'submitting' | 'success' | 'error';

const digits = (value: string | null | undefined): string =>
  (value ?? '').replace(/\D/g, '');

// A masked number must be filled to its full length; empty is left to the
// `required` validator so the two errors stay distinct.
const completePhone = (mask: string): ValidatorFn => {
  const expected = (mask.match(/#/g) ?? []).length;
  return (control) => {
    const entered = digits(control.value);
    return !entered || entered.length === expected
      ? null
      : { phoneIncomplete: true };
  };
};

/**
 * Inquiry form (FR-NAV-06) — a code page, not a CMS Page. The visitor picks a
 * preferred contact channel and that channel's field becomes required.
 * The phone field's country code and mask come from deployment config.
 */
@Component({
  selector: 'app-inquiry-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Button,
    PhoneMask,
    FieldLabel,
    Input,
  ],
  template: `
    <div class="mx-auto max-w-xl">
      <h1 class="mb-4 text-3xl font-bold tracking-tight">{{ heading }}</h1>

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

          <div>
            <label for="email" appFieldLabel>
              {{ text.email }}
              @if (preferred() === 'email') {
                <span class="text-accent" aria-hidden="true">*</span>
              }
            </label>
            <input
              id="email"
              type="email"
              formControlName="email"
              appInput
              class="w-full"
              [attr.aria-required]="preferred() === 'email' || null"
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
              {{ text.phone }}
              @if (preferred() === 'phone') {
                <span class="text-accent" aria-hidden="true">*</span>
              }
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
                  appPhoneMask
                  [mask]="phoneInput.mask ?? ''"
                  formControlName="phone"
                  appInput
                  class="w-full rounded-l-none"
                  [attr.aria-required]="preferred() === 'phone' || null"
                  [attr.aria-invalid]="isInvalid('phone') || null"
                />
              </div>
            } @else {
              <input
                id="phone"
                type="tel"
                formControlName="phone"
                appInput
                class="w-full"
                [attr.aria-required]="preferred() === 'phone' || null"
                [attr.aria-invalid]="isInvalid('phone') || null"
              />
            }
            @if (isInvalid('phone')) {
              <p class="mt-1 text-sm text-red-600">
                {{
                  form.controls.phone.hasError('required')
                    ? text.validation.phoneRequired
                    : text.validation.phoneIncomplete
                }}
              </p>
            }
          </div>

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
                formControlName="acceptPrivacy"
                class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
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
  protected readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
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
    const base =
      'cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-primary';
    const state =
      this.preferred() === value
        ? 'bg-primary text-white'
        : 'text-ink hover:bg-stone-100';
    return `${base} ${state}`;
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

    if (preferred === 'phone') {
      const mask = this.phoneInput?.mask;
      phone.setValidators(
        mask
          ? [Validators.required, completePhone(mask)]
          : [Validators.required],
      );
      email.setValidators([emailFormat]);
    } else {
      email.setValidators([Validators.required, emailFormat]);
      phone.setValidators([]);
    }

    email.updateValueAndValidity({ emitEvent: false });
    phone.updateValueAndValidity({ emitEvent: false });
  }

  private toRequest(): InquiryRequest {
    const value = this.form.getRawValue();
    const national = value.phone.trim();
    const phone = national
      ? this.phoneInput
        ? `${this.phoneInput.countryCode} ${national}`
        : national
      : undefined;

    return {
      name: value.name,
      email: value.email || undefined,
      phone,
      preferredContact: value.preferredContact,
      message: value.message || undefined,
      // Honeypot.
      website: value.website || undefined,
    };
  }
}
