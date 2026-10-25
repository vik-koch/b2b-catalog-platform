import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { emailFormat } from '../../shared/core/contact-fields';
import { FieldErrors } from '../../shared/core/form-errors';
import { usePageSeo } from '../../shared/core/page-seo';
import { Button } from '../../shared/ui/button';
import { EmailField } from '../../shared/ui/email-field';
import { AuthCard } from './auth-card';
import { AuthService } from '../../shared/auth/auth.service';
import { TextButton } from '../../shared/ui/link';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';
import { PageIntro } from '../../shared/ui/page-intro';

type Status = 'idle' | 'submitting' | 'success' | 'error';

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
    ReactiveFormsModule,
    RouterLink,
    Button,
    EmailField,
    TextButton,
    PageTitle,
    ErrorText,
    PageIntro,
  ],
  template: `
    <app-auth-card>
      @if (status() === 'success') {
        <h1 appPageTitle class="mb-2">
          {{ text.successHeading }}
        </h1>
        <p appPageIntro role="status">{{ text.success }}</p>
        <a appButton variant="secondary" routerLink="/login" class="mt-8">
          {{ text.backToLogin }}
        </a>
      } @else {
        <h1 appPageTitle class="mb-2">
          {{ text.heading }}
        </h1>
        <p appPageIntro class="mb-4">{{ text.intro }}</p>

        <form
          class="space-y-6"
          novalidate
          (ngSubmit)="submit()"
          [formGroup]="form"
        >
          <app-email-field
            [control]="form.controls.email"
            [label]="fields.email.label"
            [text]="emailText"
            [required]="true"
            [invalid]="isInvalid()"
          />

          <div class="flex flex-wrap items-center gap-4">
            <button
              appButton
              type="submit"
              [disabled]="status() === 'submitting'"
            >
              {{ status() === 'submitting' ? actionText.sending : text.submit }}
            </button>
            <a appTextButton routerLink="/login" class="text-sm">
              {{ text.backToLogin }}
            </a>
          </div>

          @if (status() === 'error') {
            <p appErrorText role="alert">{{ text.error }}</p>
          }
        </form>
      }
    </app-auth-card>
  `,
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly text = inject(STOREFRONT_TEXT).auth.forgotPassword;
  protected readonly fields = inject(SHARED_TEXT).fields;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly emailText = {
    required: this.fields.email.required,
    invalid: this.fields.email.invalid,
  };
  protected readonly status = signal<Status>('idle');

  protected readonly form = this.fb.nonNullable.group({
    // The contract's own rule, so the browser and the server agree on what a
    // valid address is.
    email: ['', [Validators.required, emailFormat()]],
  });
  private readonly fieldErrors = new FieldErrors(this.form);

  constructor() {
    usePageSeo({ name: () => this.text.heading });
  }

  protected isInvalid(): boolean {
    return this.fieldErrors.show(this.form.controls.email);
  }

  protected async submit(): Promise<void> {
    this.fieldErrors.markSubmitted();
    if (this.form.invalid) return;

    this.status.set('submitting');
    const result = await this.auth.forgotPassword(
      this.form.getRawValue().email,
    );
    this.status.set(result === 'ok' ? 'success' : 'error');
  }
}
