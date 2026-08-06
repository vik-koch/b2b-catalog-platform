import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { emailSchema } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { zodValidator } from '../core/zod-validator';
import { Button } from '../ui/button';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { AuthService } from './auth.service';

type Status = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Self-registration (FR-AUTH-01). The address is all that is asked for — name
 * and phone belong to checkout — and nothing is signed in afterwards: the
 * account is a request until staff approve it, which the copy says up front so
 * the wait is expected rather than read as a broken signup.
 *
 * The success message is deliberately non-committal ("if we can set up an
 * account for this address"), because the server answers the same way for an
 * address that already has one. Saying more here would leak what the API
 * carefully does not.
 */
@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, Button, FieldLabel, Input],
  template: `
    <div class="mx-auto max-w-sm">
      @if (status() === 'success') {
        <h1 class="mb-4 text-3xl font-bold tracking-tight">
          {{ text.register.successHeading }}
        </h1>
        <p class="text-muted">{{ text.register.success }}</p>
        <a appButton variant="secondary" routerLink="/" class="mt-8">
          {{ home }}
        </a>
      } @else {
        <h1 class="mb-4 text-3xl font-bold tracking-tight">
          {{ text.register.heading }}
        </h1>
        <p class="mb-8 text-muted">{{ text.register.intro }}</p>

        <form
          [formGroup]="form"
          (ngSubmit)="submit()"
          novalidate
          class="space-y-6"
        >
          <div>
            <label for="email" appFieldLabel>
              {{ text.email }}
            </label>
            <input
              id="email"
              type="email"
              formControlName="email"
              autocomplete="email"
              aria-required="true"
              appInput
              class="w-full"
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

          @if (status() === 'error') {
            <p class="text-sm text-red-600" role="alert">
              {{ text.register.error }}
            </p>
          }

          <button
            appButton
            type="submit"
            [disabled]="status() === 'submitting'"
          >
            {{
              status() === 'submitting'
                ? text.register.submitting
                : text.register.submit
            }}
          </button>
        </form>

        <p class="mt-8 text-sm text-muted">
          {{ text.register.haveAccount }}
          <a routerLink="/login" class="text-primary underline">{{
            text.login
          }}</a>
        </p>
      }
    </div>
  `,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly text = inject(APP_TEXT).auth;
  protected readonly home = inject(APP_TEXT).errors.notFoundBack;
  protected readonly status = signal<Status>('idle');

  protected readonly form = this.fb.nonNullable.group({
    // The contract's own rule, so client and server agree on what a valid
    // address is.
    email: ['', [Validators.required, zodValidator(emailSchema, 'email')]],
    website: [''],
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
    const { email, website } = this.form.getRawValue();
    const result = await this.auth.register({
      email,
      // The contract treats an empty honeypot as absent; send it that way.
      website: website || undefined,
    });
    this.status.set(result === 'ok' ? 'success' : 'error');
  }
}
