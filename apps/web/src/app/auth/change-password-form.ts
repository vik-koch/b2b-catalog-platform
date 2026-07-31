import { Component, inject, input, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  newPasswordSchema,
  PASSWORD_MIN_LENGTH,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { zodValidator } from '../core/zod-validator';
import { Button } from '../ui/button';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { AuthService, ChangePasswordResult } from './auth.service';

/**
 * Cross-field check: the confirmation has to match. It lives on the group
 * because neither control can see the other, and reports on the group so the
 * confirm field's own required/length errors stay independent of it.
 */
const passwordsMatch = (group: AbstractControl): ValidationErrors | null => {
  const password = group.get('newPassword')?.value;
  const confirmation = group.get('confirmPassword')?.value;
  return password === confirmation ? null : { mismatch: true };
};

/**
 * Reusable change-password form.
 */
@Component({
  selector: 'app-change-password-form',
  imports: [ReactiveFormsModule, Button, FieldLabel, Input],
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
      novalidate
      class="max-w-sm space-y-6"
    >
      <div>
        <label [for]="id('current')" appFieldLabel>
          {{ text.currentPassword }}
        </label>
        <input
          [id]="id('current')"
          type="password"
          formControlName="currentPassword"
          autocomplete="current-password"
          aria-required="true"
          appInput
          class="w-full"
          [attr.aria-invalid]="isInvalid('currentPassword') || null"
        />
        @if (isInvalid('currentPassword')) {
          <p class="mt-1 text-sm text-red-600">
            {{ validation.currentPasswordRequired }}
          </p>
        }
      </div>

      <div>
        <label [for]="id('new')" appFieldLabel>
          {{ text.newPassword }}
        </label>
        <input
          [id]="id('new')"
          type="password"
          formControlName="newPassword"
          autocomplete="new-password"
          aria-required="true"
          appInput
          class="w-full"
          [attr.aria-invalid]="isInvalid('newPassword') || null"
          [attr.aria-describedby]="id('new-hint')"
        />
        <p [id]="id('new-hint')" class="mt-1 text-sm text-muted">
          {{ minLengthHint }}
        </p>
        @if (isInvalid('newPassword')) {
          <p class="mt-1 text-sm text-red-600">
            {{
              form.controls.newPassword.hasError('required')
                ? validation.newPasswordRequired
                : minLengthHint
            }}
          </p>
        }
      </div>

      <div>
        <label [for]="id('confirm')" appFieldLabel>
          {{ text.confirmPassword }}
        </label>
        <input
          [id]="id('confirm')"
          type="password"
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

      @if (status() === 'wrong-current' || status() === 'error') {
        <p class="text-sm text-red-600" role="alert">
          {{ status() === 'wrong-current' ? text.wrongCurrent : text.error }}
        </p>
      }
      @if (status() === 'ok') {
        <p class="text-sm text-green-700" role="status">{{ text.success }}</p>
      }

      <button appButton type="submit" [disabled]="status() === 'submitting'">
        {{ status() === 'submitting' ? text.submitting : text.submit }}
      </button>
    </form>
  `,
})
export class ChangePasswordForm {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  private readonly authText = inject(APP_TEXT).auth;
  protected readonly text = this.authText.changePassword;
  protected readonly validation = this.authText.validation;

  /** Emitted after the password was actually changed — the modal closes on it. */
  readonly changed = output<void>();

  /**
   * Namespaces this instance's element ids. The form can be on the page while
   * the forced modal holds a second copy, and duplicate ids would break the
   * label/input pairing; a caller-supplied prefix keeps them apart while staying
   * deterministic (a random one would differ between server and client markup).
   */
  readonly idPrefix = input('change-password');

  protected readonly status = signal<
    'idle' | 'submitting' | ChangePasswordResult
  >('idle');

  protected readonly minLengthHint =
    this.validation.newPasswordTooShort.replace(
      '{min}',
      String(PASSWORD_MIN_LENGTH),
    );

  protected readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      // The contract's own rule, so client and server agree on what counts as
      // an acceptable password.
      newPassword: [
        '',
        [Validators.required, zodValidator(newPasswordSchema, 'tooShort')],
      ],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected isInvalid(control: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  /**
   * Mismatch is only worth showing once the confirmation has been engaged with —
   * otherwise every keystroke in the new-password field would flag an empty
   * confirmation as "does not match".
   */
  protected showMismatch(): boolean {
    const c = this.form.controls.confirmPassword;
    return this.form.hasError('mismatch') && (c.touched || c.dirty);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.status.set('submitting');
    const { currentPassword, newPassword } = this.form.getRawValue();
    const result = await this.auth.changePassword({
      currentPassword,
      newPassword,
    });
    this.status.set(result);

    if (result === 'ok') {
      // Nothing typed here should survive a success — least of all in a form
      // the user may leave open. reset() also clears touched, so the emptied
      // required fields don't immediately light up red.
      this.form.reset();
      this.changed.emit();
    }
  }

  protected id(part: string): string {
    return `${this.idPrefix()}-${part}`;
  }
}
