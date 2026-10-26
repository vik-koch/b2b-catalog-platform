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
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import {
  canonicalPhone,
  formatPhone,
  typedPhone,
} from '../../shared/core/contact-fields';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { completeMask } from '../../shared/core/field-rules';
import { usePageSeo } from '../../shared/core/page-seo';
import { AuthService } from '../../shared/auth/auth.service';
import { Button } from '../../shared/ui/button';
import { FieldLabel } from '../../shared/ui/field-label';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { Input } from '../../shared/ui/input';
import { PhoneInput } from '../../shared/ui/phone-input';
import { Skeleton } from '../../shared/ui/skeleton';
import { AccountService } from './account.service';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';
import { Hint } from '../../shared/ui/hint';
import { PageIntro } from '../../shared/ui/page-intro';

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
      <h1 appPageTitle class="mb-2">
        {{ text.heading }}
      </h1>
      <p appPageIntro class="mb-4">{{ text.intro }}</p>

      @if (profile.hasValue()) {
        <form [formRoot]="form" class="space-y-6">
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

          <!-- Optional, as on the staff editor: a staff account often has no
               number, and one that is gone is not a reason to refuse the save. -->
          <!-- Where the number receives sign-in codes it is how the account
               signs in, so staff change it (FR-AUTH-12): shown, not offered. -->
          @if (locked()) {
            <div>
              <p appFieldLabel>{{ fields.phone.label }}</p>
              <p>{{ lockedPhone() }}</p>
              <p appHint class="mt-1">{{ text.phoneLocked }}</p>
            </div>
          } @else {
            <app-field
              [field]="form.phone"
              [label]="fields.phone.label"
              controlId="phone"
            >
              <app-phone-input [field]="form.phone" />
            </app-field>
          }

          <div class="flex flex-wrap items-center gap-3">
            <button appButton type="submit" [disabled]="submitting()">
              {{ submitting() ? actionText.saving : text.submit }}
            </button>
            <!-- A link, because it goes somewhere — styled as a button so it
                 reads as the other half of the pair rather than as prose. -->
            <a appButton variant="secondary" routerLink="/account">
              {{ actionText.cancel }}
            </a>
          </div>

          @if (failure(); as line) {
            <p appErrorText role="alert">{{ line }}</p>
          }
        </form>
      } @else if (profile.error()) {
        <p appErrorText role="alert">
          {{ accountText.error }}
        </p>
      } @else if (showSkeleton()) {
        <app-skeleton [lines]="4" />
      }
    </div>
  `,
})
export class AccountEditPage {
  private readonly account = inject(AccountService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly text = inject(STOREFRONT_TEXT).account.edit;
  protected readonly accountText = inject(STOREFRONT_TEXT).account;
  protected readonly fields = inject(SHARED_TEXT).fields;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  private readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
  protected readonly status = signal<Status>('idle');

  protected readonly profile = resource({
    loader: () => this.account.getProfile(),
  });
  protected readonly showSkeleton = delayedLoading(this.profile.isLoading);

  /**
   * Seeded from the record rather than from the session: the greeting knows a
   * first name, the form has to know everything it may write back.
   */
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
      required(account.firstName, { message: this.fields.firstName.required });
      required(account.lastName, { message: this.fields.lastName.required });
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

  /** The number receives sign-in codes, so staff change it (FR-AUTH-12). */
  protected readonly locked = computed(
    () => this.profile.value()?.phoneLocked ?? false,
  );
  protected readonly lockedPhone = computed(() =>
    formatPhone(this.profile.value()?.phone ?? null, this.phoneInput),
  );

  protected failure(): string | null {
    return this.status() === 'error' ? this.text.error : null;
  }

  protected submitting(): boolean {
    return this.status() === 'submitting';
  }

  private async send(): Promise<void> {
    this.status.set('submitting');
    const value = this.form().value();
    try {
      const saved = await this.account.updateProfile({
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        // A locked number goes back as it is. Otherwise an empty field clears
        // it; the API separates "no phone" from "unchanged" by null rather
        // than by an empty string.
        phone: this.locked()
          ? (this.profile.value()?.phone ?? null)
          : canonicalPhone(value.phone, this.phoneInput) || null,
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
