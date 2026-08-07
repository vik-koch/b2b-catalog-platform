import { Component, effect, inject, resource, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { canonicalPhone, typedPhone } from '../core/contact-fields';
import { delayedLoading } from '../core/delayed-loading';
import { FieldErrors } from '../core/form-errors';
import { completeMask } from '../core/masked-input';
import { usePageSeo } from '../core/page-seo';
import { AuthService } from '../auth/auth.service';
import { Button } from '../ui/button';
import { DigitMask } from '../ui/digit-mask';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';
import { AccountService } from './account.service';

type Status = 'idle' | 'submitting' | 'error';

/**
 * Correcting your own name and phone number. A route rather than an inline form
 * on the account page, the same way the admin editors are routes: an edit is a
 * place you can be, and be sent back to.
 *
 * What it does *not* offer is the point: the account type and registration
 * number are the evidence staff approved the account and its tier on, and the
 * address is the sign-in name. The intro says who to ask instead of leaving
 * them apparently uneditable for no reason.
 */
@Component({
  selector: 'app-account-edit-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Button,
    DigitMask,
    FieldLabel,
    Input,
    Skeleton,
  ],
  template: `
    <div class="mx-auto max-w-xl">
      <h1 class="mb-2 text-3xl font-bold tracking-tight">{{ text.heading }}</h1>
      <p class="mb-8 text-muted">{{ text.intro }}</p>

      @if (profile.hasValue()) {
        <form
          class="space-y-6"
          novalidate
          (ngSubmit)="submit()"
          [formGroup]="form"
        >
          <div>
            <label for="firstName" appFieldLabel>
              {{ text.firstName }}
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
                {{ validation.firstNameRequired }}
              </p>
            }
          </div>

          <div>
            <label for="lastName" appFieldLabel>
              {{ text.lastName }}
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
                {{ validation.lastNameRequired }}
              </p>
            }
          </div>

          <!-- Optional, as on the staff editor: a staff account often has no
               number, and one that is gone is not a reason to refuse the save. -->
          <div>
            <label for="phone" appFieldLabel>{{ accountText.phone }}</label>
            @if (phoneInput; as config) {
              <div class="flex">
                <span
                  class="inline-flex items-center rounded-l-md border border-r-0 border-border-strong bg-stone-100 px-3 text-muted"
                >
                  {{ config.countryCode }}
                </span>
                <input
                  id="phone"
                  type="tel"
                  appDigitMask
                  [mask]="config.mask ?? ''"
                  formControlName="phone"
                  autocomplete="tel"
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
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('phone') || null"
              />
            }
            @if (isInvalid('phone')) {
              <p class="mt-1 text-sm text-red-600">
                {{ validation.phoneIncomplete }}
              </p>
            }
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <button appButton type="submit" [disabled]="submitting()">
              {{ submitting() ? text.submitting : text.submit }}
            </button>
            <!-- A link, because it goes somewhere — styled as a button so it
                 reads as the other half of the pair rather than as prose. -->
            <a appButton variant="secondary" routerLink="/account">
              {{ text.cancel }}
            </a>
          </div>

          @if (status() === 'error') {
            <p class="text-sm text-red-600" role="alert">{{ text.error }}</p>
          }
        </form>
      } @else if (profile.error()) {
        <p class="text-sm text-red-600" role="alert">
          {{ accountText.error }}
        </p>
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }
    </div>
  `,
})
export class AccountEditPage {
  private readonly fb = inject(FormBuilder);
  private readonly account = inject(AccountService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly text = inject(APP_TEXT).auth.myAccount.edit;
  protected readonly accountText = inject(APP_TEXT).auth.myAccount;
  protected readonly validation = inject(APP_TEXT).auth.register.validation;
  protected readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
  protected readonly status = signal<Status>('idle');

  protected readonly profile = resource({
    loader: () => this.account.getProfile(),
  });
  protected readonly showSkeleton = delayedLoading(this.profile.isLoading);

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    // Not required, but a masked number still has to be *complete*: the mask
    // says how many digits this deployment expects, and half of them is the
    // most likely way to end up unreachable.
    phone: [
      '',
      this.phoneInput?.mask ? [completeMask(this.phoneInput.mask)] : [],
    ],
  });

  protected readonly fieldErrors = new FieldErrors(this.form);

  constructor() {
    // Seeded from the record rather than from the session: the greeting knows a
    // first name, the form has to know everything it may write back.
    effect(() => {
      const profile = this.profile.value();
      if (!profile) return;
      this.form.reset({
        firstName: profile.firstName ?? '',
        lastName: profile.lastName ?? '',
        phone: typedPhone(profile.phone, this.phoneInput),
      });
    });

    usePageSeo({ name: () => this.text.heading });
  }

  protected submitting(): boolean {
    return this.status() === 'submitting';
  }

  protected isInvalid(control: keyof typeof this.form.controls): boolean {
    return this.fieldErrors.show(this.form.controls[control]);
  }

  protected async submit(): Promise<void> {
    this.fieldErrors.markSubmitted();
    if (this.form.invalid) return;

    this.status.set('submitting');
    const value = this.form.getRawValue();
    try {
      const saved = await this.account.updateProfile({
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        // An empty field clears the number; the API separates "no phone" from
        // "unchanged" by null rather than by an empty string.
        phone: canonicalPhone(value.phone, this.phoneInput) || null,
      });
      // The greeting is built from the session, not from this response, so a
      // changed first name only reaches the header once /auth/me is re-asked.
      await this.auth.refresh();
      this.profile.set(saved);
      // Back to the record, with no "saved" notice: the page it lands on shows
      // the new values, which says it better than a message about them would.
      await this.router.navigateByUrl('/account');
    } catch {
      this.status.set('error');
    }
  }
}
