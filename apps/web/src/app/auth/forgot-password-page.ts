import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { emailFormat } from '../core/contact-fields';
import { FieldErrors } from '../core/form-errors';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { EmailField } from '../ui/email-field';
import { AuthCard } from './auth-card';
import { AuthService } from './auth.service';
import { Link } from '../ui/link';

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
    Link,
  ],
  template: `
    <app-auth-card>
      @if (status() === 'success') {
        <h1 class="mb-2 text-3xl font-medium tracking-tight">
          {{ text.successHeading }}
        </h1>
        <p class="text-muted" role="status">{{ text.success }}</p>
        <a appButton variant="secondary" routerLink="/login" class="mt-8">
          {{ text.backToLogin }}
        </a>
      } @else {
        <h1 class="mb-2 text-3xl font-medium tracking-tight">
          {{ text.heading }}
        </h1>
        <p class="mb-8 text-muted">{{ text.intro }}</p>

        <form
          class="space-y-6"
          novalidate
          (ngSubmit)="submit()"
          [formGroup]="form"
        >
          <app-email-field
            [control]="form.controls.email"
            [label]="authText.email"
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
              {{ status() === 'submitting' ? text.submitting : text.submit }}
            </button>
            <a appLink routerLink="/login" class="text-sm">
              {{ text.backToLogin }}
            </a>
          </div>

          @if (status() === 'error') {
            <p class="text-sm text-red-600" role="alert">{{ text.error }}</p>
          }
        </form>
      }
    </app-auth-card>
  `,
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly authText = inject(APP_TEXT).auth;
  protected readonly text = inject(APP_TEXT).auth.forgotPassword;
  protected readonly validation = inject(APP_TEXT).auth.validation;
  protected readonly emailText = {
    required: this.validation.emailRequired,
    invalid: this.validation.emailInvalid,
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
