import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { form, required } from '@angular/forms/signals';
import { fillText } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { confirmation, newPassword } from './password';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { SubmitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { SignInService, ChangePasswordResult } from './sign-in.service';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { PASSWORD_MIN_LENGTH } from '@b2b-catalog-platform/shared/core/accounts';

/** No required marks: marking every field on a form marks none. */
@Component({
  selector: 'app-change-password-form',
  imports: [FORM_FIELDS, Button, Input, ErrorText],
  template: `
    <form [formRoot]="form" class="space-y-6">
      <ui-field
        [field]="form.currentPassword"
        [label]="text.currentPassword"
        [marker]="false"
        [controlId]="id('current')"
      >
        <input
          type="password"
          autocomplete="current-password"
          uiInput
          class="w-full"
          [formField]="form.currentPassword"
        />
      </ui-field>

      <!-- The rule as the hint: the refusal is the same sentence. -->
      <ui-field
        [field]="form.newPassword"
        [label]="text.newPassword"
        [hint]="minLengthHint"
        [marker]="false"
        [controlId]="id('new')"
      >
        <input
          type="password"
          autocomplete="new-password"
          uiInput
          class="w-full"
          [formField]="form.newPassword"
        />
      </ui-field>

      <ui-field
        [field]="form.confirmPassword"
        [label]="text.confirmPassword"
        [marker]="false"
        [controlId]="id('confirm')"
      >
        <input
          type="password"
          autocomplete="new-password"
          uiInput
          class="w-full"
          [formField]="form.confirmPassword"
        />
      </ui-field>

      @if (failure(); as message) {
        <p uiErrorText role="alert">{{ message }}</p>
      }
      @if (outcome()?.result === 'ok') {
        <p class="text-sm text-success" role="status">{{ text.success }}</p>
      }

      <button uiButton type="submit" [disabled]="form().submitting()">
        {{ form().submitting() ? text.submitting : text.submit }}
      </button>
    </form>
  `,
})
export class ChangePasswordForm {
  private readonly auth = inject(SignInService);

  private readonly authText = inject(STOREFRONT_TEXT).auth;
  protected readonly text = this.authText.changePassword;
  private readonly validation = this.authText.validation;
  private readonly rejected = this.authText.passwordRejected;

  readonly changed = output<void>();

  /**
   * Keeps ids apart while the forced dialog holds a second copy. Fixed, not
   * random, so server and client markup agree.
   */
  readonly idPrefix = input('change-password');

  /** The last answer, kept while the next request is out. */
  protected readonly outcome = signal<ChangePasswordResult | null>(null);

  protected readonly failure = computed(() => {
    const outcome = this.outcome();
    switch (outcome?.result) {
      case 'wrong-current':
        return this.text.wrongCurrent;
      case 'rejected':
        return this.rejected[outcome.code];
      case 'error':
        return this.text.error;
      default:
        return null;
    }
  });

  protected readonly minLengthHint = fillText(
    this.validation.newPasswordTooShort,
    { min: PASSWORD_MIN_LENGTH },
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
    const { currentPassword, newPassword } = this.model();
    const outcome = await this.auth.changePassword({
      currentPassword,
      newPassword,
    });
    this.outcome.set(outcome);

    if (outcome.result === 'ok') {
      // The attempt goes too: the emptied required fields would show red
      // beside the success.
      this.form().reset(this.empty);
      this.attempt().reset();
      this.changed.emit();
    }
  }

  protected id(part: string): string {
    return `${this.idPrefix()}-${part}`;
  }
}
