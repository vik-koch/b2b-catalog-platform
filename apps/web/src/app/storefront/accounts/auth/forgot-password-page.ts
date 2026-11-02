import { Component, inject, signal } from '@angular/core';
import { form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { emailAddress } from '../../shared/core/field-rules';
import { usePageSeo } from '../../shared/core/page-seo';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { AuthCard } from './auth-card';
import { AuthService } from '../../shared/auth/auth.service';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';

type Status = 'idle' | 'success' | 'error';

/**
 * Asking for a reset link (FR-AUTH-02). Only the *request* half lives here —
 * the link lands on /set-password, which already serves the invitation and
 * works out from the account's status whether this is a first password or a
 * replacement.
 *
 * The success state deliberately promises less than it knows: the server does
 * not say whether the address has an account, so neither can this page, or the
 * form becomes a way to test which addresses are customers.
 */
@Component({
  selector: 'app-forgot-password-page',
  imports: [
    AuthCard,
    FORM_FIELDS,
    RouterLink,
    Button,
    Input,
    TextButton,
    PageTitle,
    ErrorText,
    PageIntro,
  ],
  template: `
    <app-auth-card>
      @if (status() === 'success') {
        <h1 uiPageTitle class="mb-2">
          {{ text.successHeading }}
        </h1>
        <p uiPageIntro role="status">{{ text.success }}</p>
        <a uiButton variant="secondary" routerLink="/login" class="mt-8">
          {{ text.backToLogin }}
        </a>
      } @else {
        <h1 uiPageTitle class="mb-2">
          {{ text.heading }}
        </h1>
        <p uiPageIntro class="mb-4">{{ text.intro }}</p>

        <form [formRoot]="form" class="space-y-6">
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

          <div class="flex flex-wrap items-center gap-4">
            <button uiButton type="submit" [disabled]="form().submitting()">
              {{ form().submitting() ? actionText.sending : text.submit }}
            </button>
            <a uiTextButton routerLink="/login" class="text-sm">
              {{ text.backToLogin }}
            </a>
          </div>

          @if (status() === 'error') {
            <p uiErrorText role="alert">{{ text.error }}</p>
          }
        </form>
      }
    </app-auth-card>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);

  protected readonly text = inject(STOREFRONT_TEXT).auth.forgotPassword;
  protected readonly fields = inject(SHARED_TEXT).fields;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly status = signal<Status>('idle');

  protected readonly form = form(
    signal({ email: '' }),
    (request) => {
      required(request.email, { message: this.fields.email.required });
      emailAddress(request.email, this.fields.email.invalid);
    },
    { name: 'forgot-password', submission: { action: () => this.send() } },
  );

  constructor() {
    usePageSeo({ name: () => this.text.heading });
  }

  private async send(): Promise<void> {
    this.status.set('idle');
    const result = await this.auth.forgotPassword(this.form.email().value());
    this.status.set(result === 'ok' ? 'success' : 'error');
  }
}
