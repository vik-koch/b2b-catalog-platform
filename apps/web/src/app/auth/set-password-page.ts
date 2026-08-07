import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  newPasswordSchema,
  PASSWORD_MIN_LENGTH,
  PasswordTokenPurpose,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { FieldErrors } from '../core/form-errors';
import { generatePassword, passwordsMatch } from '../core/password';
import { zodValidator } from '../core/zod-validator';
import { Button } from '../ui/button';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { AuthService } from './auth.service';
import { landingFor } from './auth.guard';

type Status = 'checking' | 'ready' | 'expired' | 'submitting' | 'done';

/**
 * Where an invitation or a reset mail lands (FR-AUTH-01/02). The link in the
 * URL is the whole credential, so this page asks for nothing else — no
 * address, no old password — and the account is signed in the moment the new
 * password is saved.
 *
 * The link is checked *before* the form renders, so an expired one gets an
 * honest explanation instead of a form that was always going to fail. What the
 * page calls itself follows the account's state, not the URL: an account that
 * has never had a password is choosing one, not resetting it.
 */
@Component({
  selector: 'app-set-password-page',
  imports: [ReactiveFormsModule, RouterLink, Button, FieldLabel, Input],
  template: `
    <div class="mx-auto max-w-sm">
      @switch (status()) {
        @case ('checking') {
          <p class="text-muted">{{ text.checking }}</p>
        }
        @case ('expired') {
          <h1 class="mb-4 text-3xl font-bold tracking-tight">
            {{ text.expiredHeading }}
          </h1>
          <p class="text-muted">{{ text.expired }}</p>
          <!-- The copy has always told them to ask for a new link; now there
               is one to click. Primary, because it is the way out of here —
               signing in is what they could not do in the first place. -->
          <div class="mt-8 flex flex-wrap items-center gap-3">
            <a appButton routerLink="/forgot-password">
              {{ auth.forgotPassword.submit }}
            </a>
            <a appButton variant="secondary" routerLink="/login">
              {{ auth.login }}
            </a>
          </div>
        }
        @case ('done') {
          <h1 class="mb-4 text-3xl font-bold tracking-tight">
            {{ text.successHeading }}
          </h1>
          <p class="text-muted">{{ text.success }}</p>
        }
        @default {
          <h1 class="mb-2 text-3xl font-bold tracking-tight">
            {{ purpose() === 'set' ? text.setHeading : text.resetHeading }}
          </h1>
          <p class="mb-8 text-muted">
            {{ purpose() === 'set' ? text.setIntro : text.resetIntro }}
            <span class="mt-1 block">{{ text.forAccount }} {{ email() }}</span>
          </p>

          <form
            [formGroup]="form"
            (ngSubmit)="submit()"
            novalidate
            class="space-y-6"
          >
            <div>
              <div class="flex items-baseline justify-between">
                <label for="newPassword" appFieldLabel>
                  {{ text.password }}
                </label>
                <button
                  type="button"
                  class="text-sm text-primary underline"
                  (click)="revealed.set(!revealed())"
                >
                  {{ revealed() ? text.hide : text.show }}
                </button>
              </div>
              <input
                id="newPassword"
                [type]="revealed() ? 'text' : 'password'"
                formControlName="newPassword"
                autocomplete="new-password"
                aria-required="true"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('newPassword') || null"
              />
              @if (isInvalid('newPassword')) {
                <p class="mt-1 text-sm text-red-600">
                  {{
                    form.controls.newPassword.hasError('required')
                      ? validation.newPasswordRequired
                      : tooShort
                  }}
                </p>
              }
              <button
                type="button"
                class="mt-2 text-sm text-primary underline"
                (click)="suggest()"
              >
                {{ text.generate }}
              </button>
              @if (suggested()) {
                <p class="mt-1 text-sm text-muted">{{ text.generated }}</p>
              }
            </div>

            <div>
              <label for="confirmPassword" appFieldLabel>
                {{ text.confirmPassword }}
              </label>
              <input
                id="confirmPassword"
                [type]="revealed() ? 'text' : 'password'"
                formControlName="confirmPassword"
                autocomplete="new-password"
                aria-required="true"
                appInput
                class="w-full"
                [attr.aria-invalid]="showMismatch() || null"
              />
              @if (showMismatch()) {
                <p class="mt-1 text-sm text-red-600">
                  {{ validation.confirmPasswordMismatch }}
                </p>
              }
            </div>

            @if (rejection(); as message) {
              <p class="text-sm text-red-600" role="alert">{{ message }}</p>
            }

            <button
              appButton
              type="submit"
              [disabled]="status() === 'submitting'"
            >
              {{ status() === 'submitting' ? text.submitting : text.submit }}
            </button>
          </form>
        }
      }
    </div>
  `,
})
export class SetPasswordPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly auth = inject(APP_TEXT).auth;
  protected readonly text = this.auth.setPassword;
  protected readonly validation = this.auth.validation;
  /** One line per policy rule, so the code the API sends is the whole lookup. */
  private readonly rejected = this.auth.passwordRejected;
  protected readonly tooShort =
    this.auth.validation.newPasswordTooShort.replace(
      '{min}',
      String(PASSWORD_MIN_LENGTH),
    );

  /** The link itself, from the query string. */
  readonly token = input<string>('');

  protected readonly status = signal<Status>('checking');
  protected readonly purpose = signal<PasswordTokenPurpose>('set');
  protected readonly email = signal('');
  protected readonly revealed = signal(false);
  protected readonly suggested = signal(false);
  /** The refusal to show under the field, once there is one. */
  protected readonly rejection = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      newPassword: [
        '',
        [Validators.required, zodValidator(newPasswordSchema, 'tooShort')],
      ],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected readonly fieldErrors = new FieldErrors(this.form);

  async ngOnInit(): Promise<void> {
    const account = await this.service.checkPasswordToken(this.token());
    if (!account) {
      this.status.set('expired');
      return;
    }
    this.purpose.set(account.purpose);
    this.email.set(account.email);
    this.status.set('ready');
  }

  protected isInvalid(control: keyof typeof this.form.controls): boolean {
    return this.fieldErrors.show(this.form.controls[control]);
  }

  protected showMismatch(): boolean {
    return this.fieldErrors.showGroupError(
      'mismatch',
      this.form.controls.confirmPassword,
    );
  }

  /**
   * Fill both fields with a strong password and reveal it: a password nobody
   * can see is a password nobody can save, and the point of suggesting one is
   * that the visitor copies it into their manager.
   */
  protected suggest(): void {
    const password = generatePassword();
    this.form.setValue({ newPassword: password, confirmPassword: password });
    this.revealed.set(true);
    this.suggested.set(true);
  }

  protected async submit(): Promise<void> {
    this.fieldErrors.markSubmitted();
    this.rejection.set(null);
    if (this.form.invalid) return;

    this.status.set('submitting');
    const { result, code } = await this.service.setPassword({
      token: this.token(),
      password: this.form.controls.newPassword.value,
    });

    if (result === 'ok') {
      this.status.set('done');
      // Straight to where this role belongs — the account is signed in.
      const user = this.service.user();
      await this.router.navigateByUrl(user ? landingFor(user.role) : '/');
      return;
    }
    if (result === 'expired') {
      this.status.set('expired');
      return;
    }
    this.status.set('ready');
    this.rejection.set(code ? this.rejected[code] : this.text.error);
  }
}
