import {
  Component,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { form, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { Hint } from '@b2b-catalog-platform/ui/fields/hint';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { PhoneInput } from '@b2b-catalog-platform/ui/inputs/phone-input';

import { AuthService } from '../../../platform/auth/auth.service';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import {
  canonicalPhone,
  formatPhone,
  typedPhone,
} from '../../../platform/contact-fields';
import { delayedLoading } from '../../../platform/delayed-loading';
import {
  completeMask,
  personName,
  untilInteractive,
} from '../../../platform/field-rules';
import { usePageSeo } from '../../../platform/page-seo';
import { STOREFRONT_ACCOUNTS_TEXT } from '../accounts-text';
import { AccountService } from './account.service';

/**
 * Correcting your own name and phone number. The rest is not offered: staff
 * approved the account on it, and the email is the sign-in name.
 */
@Component({
  selector: 'app-account-edit-page',
  imports: [
    FORM_FIELDS,
    RouterLink,
    Button,
    FieldLabel,
    Input,
    PhoneInput,
    Skeleton,
    PageTitle,
    ErrorText,
    Hint,
    PageIntro,
  ],
  template: `
    <div class="max-w-xl">
      <h1 uiPageTitle class="mb-2">
        {{ text.heading }}
      </h1>
      <p uiPageIntro class="mb-4">{{ text.intro }}</p>

      @if (profile.hasValue()) {
        <form [formRoot]="form" class="space-y-6">
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

          @if (locked()) {
            <div>
              <p uiFieldLabel>{{ fields.phone.label }}</p>
              <p>{{ lockedPhone() }}</p>
              <p uiHint class="mt-1">{{ text.phoneLocked }}</p>
            </div>
          } @else {
            <ui-field
              [field]="form.phone"
              [label]="fields.phone.label"
              controlId="phone"
            >
              <ui-phone-input [field]="form.phone" [phone]="phoneInput" />
            </ui-field>
          }

          <div class="flex flex-wrap items-center gap-3">
            <button uiButton type="submit" [disabled]="form().submitting()">
              {{ form().submitting() ? actionText.saving : text.submit }}
            </button>
            <a uiButton variant="secondary" routerLink="/account">
              {{ actionText.cancel }}
            </a>
          </div>

          @if (failed()) {
            <p uiErrorText role="alert">{{ text.error }}</p>
          }
        </form>
      } @else if (profile.error()) {
        <p uiErrorText role="alert">
          {{ accountText.error }}
        </p>
      } @else if (showSkeleton()) {
        <ui-skeleton [lines]="4" />
      }
    </div>
  `,
})
export class AccountEditPage {
  private readonly account = inject(AccountService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly text = inject(STOREFRONT_ACCOUNTS_TEXT).account.edit;
  protected readonly accountText = inject(STOREFRONT_ACCOUNTS_TEXT).account;
  protected readonly fields = inject(SHARED_TEXT).fields;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
  protected readonly failed = signal(false);

  protected readonly profile = resource({
    loader: () => this.account.getProfile(),
  });
  protected readonly showSkeleton = delayedLoading(this.profile.isLoading);

  /** From the record, not the session: the session knows no last name. */
  private readonly draft = linkedSignal(() => {
    const profile = this.profile.value();
    return {
      firstName: profile?.firstName ?? '',
      lastName: profile?.lastName ?? '',
      phone: typedPhone(profile?.phone ?? null, this.phoneInput),
    };
  });

  protected readonly form = form(
    this.draft,
    (account) => {
      untilInteractive(account);
      required(account.firstName, { message: this.fields.firstName.required });
      required(account.lastName, { message: this.fields.lastName.required });
      personName(account.firstName, this.fields.firstName.invalid);
      personName(account.lastName, this.fields.lastName.invalid);
      // Optional, but half a number is a typo.
      completeMask(
        account.phone,
        this.phoneInput?.mask,
        this.fields.phone.incomplete,
      );
    },
    { name: 'account-edit', submission: { action: () => this.send() } },
  );

  constructor() {
    usePageSeo({ name: () => this.text.heading });
  }

  /** A number that receives sign-in codes is staff's to change. */
  protected readonly locked = computed(
    () => this.profile.value()?.phoneLocked ?? false,
  );
  protected readonly lockedPhone = computed(() =>
    formatPhone(this.profile.value()?.phone ?? null, this.phoneInput),
  );

  private async send(): Promise<void> {
    this.failed.set(false);
    const value = this.form().value();
    try {
      const saved = await this.account.updateProfile({
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        // An empty field clears the number: the API wants null, not ''.
        phone: this.locked()
          ? (this.profile.value()?.phone ?? null)
          : canonicalPhone(value.phone, this.phoneInput) || null,
      });
      // The header's greeting reads the session, not this response.
      await this.auth.refresh();
      this.profile.set(saved);
      await this.router.navigateByUrl('/account');
    } catch {
      this.failed.set(true);
    }
  }
}
