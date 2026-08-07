import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  newPasswordSchema,
  PASSWORD_MIN_LENGTH,
  PasswordRejectionCode,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { zodValidator } from '../core/zod-validator';
import { FieldErrors } from '../core/form-errors';
import { passwordsMatch } from '../core/password';
import { Button } from '../ui/button';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { AuthService, ChangePasswordResult } from './auth.service';

/**
 * Cross-field check: the confirmation has to match. It lives on the group
 * because neither control can see the other, and reports on the group so the
 * confirm field's own required/length errors stay independent of it.
 */
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
        <!-- One line, not two: the rule and the refusal are the same sentence,
             so it changes colour rather than being printed twice. -->
        @if (isInvalid('newPassword')) {
          <p [id]="id('new-hint')" class="mt-1 text-sm text-red-600">
            {{
              form.controls.newPassword.hasError('required')
                ? validation.newPasswordRequired
                : minLengthHint
            }}
          </p>
        } @else {
          <p [id]="id('new-hint')" class="mt-1 text-sm text-muted">
            {{ minLengthHint }}
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

      @if (failure(); as message) {
        <p class="text-sm text-red-600" role="alert">{{ message }}</p>
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
  /** One line per policy rule, so the code the API sends is the whole lookup. */
  private readonly rejected = this.authText.passwordRejected;

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
    'idle' | 'submitting' | ChangePasswordResult['result']
  >('idle');
  /** Which policy rule refused the new password, when one did. */
  private readonly rejection = signal<PasswordRejectionCode | null>(null);

  /**
   * The message for whichever failure happened. `wrong-current` is about the
   * field above and has its own wording; a refused *new* password names the
   * rule that refused it, and the wording for each rule is the deployment's.
   */
  protected failure(): string | null {
    switch (this.status()) {
      case 'wrong-current':
        return this.text.wrongCurrent;
      case 'rejected': {
        const code = this.rejection();
        return code ? this.rejected[code] : this.text.error;
      }
      case 'error':
        return this.text.error;
      default:
        return null;
    }
  }

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

  /**
   * Error visibility, not validity: revealed on blur, hidden again while the
   * field is being retyped, and everything shown once submit is attempted.
   */
  protected readonly fieldErrors = new FieldErrors(this.form);

  protected isInvalid(control: keyof typeof this.form.controls): boolean {
    return this.fieldErrors.show(this.form.controls[control]);
  }

  /**
   * Mismatch is only worth showing once the confirmation has been engaged with —
   * otherwise every keystroke in the new-password field would flag an empty
   * confirmation as "does not match".
   */
  protected showMismatch(): boolean {
    return this.fieldErrors.showGroupError(
      'mismatch',
      this.form.controls.confirmPassword,
    );
  }

  protected async submit(): Promise<void> {
    this.fieldErrors.markSubmitted();
    if (this.form.invalid) {
      return;
    }

    this.status.set('submitting');
    this.rejection.set(null);
    const { currentPassword, newPassword } = this.form.getRawValue();
    const outcome = await this.auth.changePassword({
      currentPassword,
      newPassword,
    });
    this.status.set(outcome.result);
    if (outcome.result === 'rejected') {
      this.rejection.set(outcome.code);
    }

    if (outcome.result === 'ok') {
      // Nothing typed here should survive a success — least of all in a form
      // the user may leave open. The error state is reset with it: the fields
      // are empty and required, so anything still latched from the submit
      // would paint the form red next to its own success message.
      this.form.reset();
      this.fieldErrors.reset();
      this.changed.emit();
    }
  }

  protected id(part: string): string {
    return `${this.idPrefix()}-${part}`;
  }
}
