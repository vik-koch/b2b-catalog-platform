import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { emailSchema } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { FieldErrors } from '../core/form-errors';
import { usePageSeo } from '../core/page-seo';
import { zodValidator } from '../core/zod-validator';
import { Button } from '../ui/button';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { AuthService } from './auth.service';

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
  imports: [ReactiveFormsModule, RouterLink, Button, FieldLabel, Input],
  template: `
    <div class="mx-auto max-w-md">
      @if (status() === 'success') {
        <h1 class="mb-2 text-3xl font-bold tracking-tight">
          {{ text.successHeading }}
        </h1>
        <p class="text-muted" role="status">{{ text.success }}</p>
        <a appButton variant="secondary" routerLink="/login" class="mt-8">
          {{ text.backToLogin }}
        </a>
      } @else {
        <h1 class="mb-2 text-3xl font-bold tracking-tight">
          {{ text.heading }}
        </h1>
        <p class="mb-8 text-muted">{{ text.intro }}</p>

        <form
          class="space-y-6"
          novalidate
          (ngSubmit)="submit()"
          [formGroup]="form"
        >
          <div>
            <label for="email" appFieldLabel>
              {{ authText.email }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            <input
              id="email"
              type="email"
              formControlName="email"
              autocomplete="email"
              aria-required="true"
              appInput
              class="w-full"
              [attr.aria-invalid]="isInvalid() || null"
            />
            @if (isInvalid()) {
              <p class="mt-1 text-sm text-red-600">
                {{
                  form.controls.email.hasError('required')
                    ? validation.emailRequired
                    : validation.emailInvalid
                }}
              </p>
            }
          </div>

          <div class="flex flex-wrap items-center gap-4">
            <button
              appButton
              type="submit"
              [disabled]="status() === 'submitting'"
            >
              {{ status() === 'submitting' ? text.submitting : text.submit }}
            </button>
            <a
              routerLink="/login"
              class="text-sm font-medium text-primary underline underline-offset-2 hover:no-underline"
            >
              {{ text.backToLogin }}
            </a>
          </div>

          @if (status() === 'error') {
            <p class="text-sm text-red-600" role="alert">{{ text.error }}</p>
          }
        </form>
      }
    </div>
  `,
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly authText = inject(APP_TEXT).auth;
  protected readonly text = inject(APP_TEXT).auth.forgotPassword;
  protected readonly validation = inject(APP_TEXT).auth.validation;
  protected readonly status = signal<Status>('idle');

  protected readonly form = this.fb.nonNullable.group({
    // The contract's own rule, so the browser and the server agree on what a
    // valid address is.
    email: ['', [Validators.required, zodValidator(emailSchema, 'email')]],
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
