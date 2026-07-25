import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { emailSchema } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { zodValidator } from '../core/zod-validator';
import { Button } from '../ui/button';
import { AuthService, LoginResult } from './auth.service';
import { landingFor } from './auth.guard';

/**
 * The one login form, for every role (FR-AUTH-07). Where it lands afterwards
 * is the only role-dependent part: back to the gated page that sent us here,
 * else the role's own home (see `landingFor`).
 */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, Button],
  template: `
    <h1 class="mb-8 text-3xl font-bold tracking-tight">{{ text.login }}</h1>

    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      novalidate
      class="max-w-sm space-y-6"
    >
      <div>
        <label for="email" class="mb-1 block text-sm font-medium">
          {{ text.email }}
        </label>
        <input
          id="email"
          type="email"
          formControlName="email"
          autocomplete="email"
          aria-required="true"
          [class]="inputClass"
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
        <label for="password" class="mb-1 block text-sm font-medium">
          {{ text.password }}
        </label>
        <input
          id="password"
          type="password"
          formControlName="password"
          autocomplete="current-password"
          aria-required="true"
          [class]="inputClass"
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

      <button appButton type="submit" [disabled]="status() === 'submitting'">
        {{ status() === 'submitting' ? text.submitting : text.submit }}
      </button>
    </form>
  `,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly text = inject(APP_TEXT).auth;
  protected readonly status = signal<'idle' | 'submitting' | LoginResult>(
    'idle',
  );

  /** Set by the guards when they bounce a deep link here (query param). */
  readonly returnUrl = input<string>();

  protected readonly inputClass =
    'block w-full rounded-md border border-stone-300 px-3 py-2 focus:border-primary focus:outline-none';

  protected readonly form = this.fb.nonNullable.group({
    // The contract's own rule, so client and server agree on what a valid
    // address is; the password is only checked for presence here — length and
    // strength rules belong to the account that owns it, not to this form.
    email: ['', [Validators.required, zodValidator(emailSchema, 'email')]],
    password: ['', Validators.required],
  });

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
