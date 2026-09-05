import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { emailFormat } from '../core/contact-fields';
import { FieldErrors } from '../core/form-errors';
import { Button } from '../ui/button';
import { EmailField } from '../ui/email-field';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { AuthCard } from './auth-card';
import { landingFor } from './auth.guard';
import { AuthService, LoginResult } from './auth.service';
import { Link } from '../ui/link';

/**
 * The one login form, for every role (FR-AUTH-07). Where it lands afterwards
 * is the only role-dependent part: back to the gated page that sent us here,
 * else the role's own home (see `landingFor`).
 */
@Component({
  selector: 'app-login-page',
  imports: [
    AuthCard,
    ReactiveFormsModule,
    RouterLink,
    Button,
    EmailField,
    FieldLabel,
    Input,
    Link,
  ],
  template: `
    <app-auth-card>
      <h1 class="mb-8 text-3xl font-medium tracking-tight">{{ text.login }}</h1>

      <form
        [formGroup]="form"
        (ngSubmit)="submit()"
        novalidate
        class="space-y-6"
      >
        <!-- No required-marker beside either label: both fields are required,
             and marking every field on a form marks none of them. -->
        <app-email-field
          [control]="form.controls.email"
          [label]="text.email"
          [text]="emailText"
          [required]="true"
          [marker]="false"
          [invalid]="isInvalid('email')"
        />

        <div>
          <label for="password" appFieldLabel>
            {{ text.password }}
          </label>
          <input
            id="password"
            type="password"
            formControlName="password"
            autocomplete="current-password"
            aria-required="true"
            appInput
            class="w-full"
            [attr.aria-invalid]="isInvalid('password') || null"
          />
          @if (isInvalid('password')) {
            <p class="mt-1 text-sm text-red-600">
              {{ text.validation.passwordRequired }}
            </p>
          }
        </div>

        @if (status() === 'invalid' || status() === 'error') {
          <p class="text-sm text-red-600" role="alert">
            {{ status() === 'invalid' ? text.invalid : text.error }}
          </p>
        }

        <div class="flex flex-wrap items-center gap-4">
          <button
            appButton
            type="submit"
            [disabled]="status() === 'submitting'"
          >
            {{ status() === 'submitting' ? text.submitting : text.submit }}
          </button>
          <!-- Beside the button, not under the password field: it is what you
               reach for after the login fails, which is where the eye already
               is. -->
          <a appLink routerLink="/forgot-password" class="text-sm">
            {{ text.forgotPassword.link }}
          </a>
        </div>
      </form>

      <div class="mt-10 border-t border-border pt-6">
        <p class="mb-3 text-sm text-muted">{{ text.register.noAccount }}</p>
        <a appButton variant="secondary" routerLink="/register">
          {{ text.register.signUp }}
        </a>
      </div>
    </app-auth-card>
  `,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly text = inject(APP_TEXT).auth;
  protected readonly emailText = {
    required: this.text.validation.emailRequired,
    invalid: this.text.validation.emailInvalid,
  };
  protected readonly status = signal<'idle' | 'submitting' | LoginResult>(
    'idle',
  );

  /** Set by the guards when they bounce a deep link here (query param). */
  readonly returnUrl = input<string>();

  protected readonly form = this.fb.nonNullable.group({
    // The contract's own rule, so client and server agree on what a valid
    // address is; the password is only checked for presence here — length and
    // strength rules belong to the account that owns it, not to this form.
    email: ['', [Validators.required, emailFormat()]],
    password: ['', Validators.required],
  });

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
    const result = await this.auth.login(this.form.getRawValue());
    this.status.set(result);

    if (result === 'ok') {
      const user = this.auth.user();
      await this.router.navigateByUrl(
        this.safeReturnUrl() ?? (user ? landingFor(user.role) : '/'),
      );
    }
  }

  /**
   * Only same-origin paths are honoured — a `returnUrl` is attacker-supplied
   * (it rides in the URL), so anything that could name another host is an open
   * redirect. `//evil.example` is protocol-relative, hence the second check.
   */
  private safeReturnUrl(): string | null {
    const url = this.returnUrl();
    return url?.startsWith('/') && !url.startsWith('//') ? url : null;
  }
}
