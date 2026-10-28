import {
  Component,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { form, required } from '@angular/forms/signals';
import {
  PASSWORD_MIN_LENGTH,
  PasswordRejectionCode,
} from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { confirmation, newPassword } from '../../shared/core/password';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { Input } from '../../shared/ui/input';
import { SubmitAttempt } from '../../shared/ui/submit-attempt';
import {
  AuthService,
  ChangePasswordResult,
} from '../../shared/auth/auth.service';
import { ErrorText } from '../../shared/ui/error-text';

/**
 * Reusable change-password form. No required marks: every field is required,
 * and marking every field on a form marks none of them.
 */
@Component({
  selector: 'app-change-password-form',
  imports: [FORM_FIELDS, Button, Input, ErrorText],
  template: `
    <form [formRoot]="form" class="space-y-6">
      <app-field
        [field]="form.currentPassword"
        [label]="text.currentPassword"
        [marker]="false"
        [controlId]="id('current')"
      >
        <input
          type="password"
          autocomplete="current-password"
          appInput
          class="w-full"
          [formField]="form.currentPassword"
        />
      </app-field>

      <!-- One line, not two: the rule and the refusal are the same sentence,
           so it changes colour rather than being printed twice. -->
      <app-field
        [field]="form.newPassword"
        [label]="text.newPassword"
        [hint]="minLengthHint"
        [marker]="false"
        [controlId]="id('new')"
      >
        <input
          type="password"
          autocomplete="new-password"
          appInput
          class="w-full"
          [formField]="form.newPassword"
        />
      </app-field>

      <app-field
        [field]="form.confirmPassword"
        [label]="text.confirmPassword"
        [marker]="false"
        [controlId]="id('confirm')"
      >
        <input
          type="password"
          autocomplete="new-password"
          appInput
          class="w-full"
          [formField]="form.confirmPassword"
        />
      </app-field>

      @if (failure(); as message) {
        <p appErrorText role="alert">{{ message }}</p>
      }
      @if (status() === 'ok') {
        <p class="text-sm text-success" role="status">{{ text.success }}</p>
      }

      <button appButton type="submit" [disabled]="status() === 'submitting'">
        {{ status() === 'submitting' ? text.submitting : text.submit }}
      </button>
    </form>
  `,
})
export class ChangePasswordForm {
  private readonly auth = inject(AuthService);

  private readonly authText = inject(STOREFRONT_TEXT).auth;
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

  private readonly empty = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };
  private readonly model = signal(this.empty);
  protected readonly form = form(
    this.model,
    (change) => {
      required(change.currentPassword, {
        message: this.validation.currentPasswordRequired,
      });
      newPassword(change.newPassword, {
        required: this.validation.newPasswordRequired,
        length: this.minLengthHint,
      });
      confirmation(
        change.confirmPassword,
        change.newPassword,
        this.validation.confirmPasswordMismatch,
      );
    },
    { name: 'change-password', submission: { action: () => this.send() } },
  );
  private readonly attempt = viewChild.required(SubmitAttempt);

  private async send(): Promise<void> {
    this.status.set('submitting');
    this.rejection.set(null);
    const { currentPassword, newPassword } = this.model();
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
      // the user may leave open. The submit is forgotten with it: the fields
      // are empty and required, so anything still latched from it would paint
      // the form red next to its own success message.
      this.form().reset(this.empty);
      this.attempt().reset();
      this.changed.emit();
    }
  }

  protected id(part: string): string {
    return `${this.idPrefix()}-${part}`;
  }
}
