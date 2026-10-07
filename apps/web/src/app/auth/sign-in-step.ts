import { Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { AuthService } from './auth.service';
import { CodeEntry, formatWait } from './code-entry';

export { formatWait };

/**
 * The code after the password (FR-AUTH-12), wherever a password leads to a
 * session: the sign-in form and the set-password page show this in place of
 * their own form once the API says a code is owed.
 *
 * The code goes to the number staff set. Nobody chooses another number here:
 * a holder who cannot receive codes on it asks the shop.
 */
@Component({
  selector: 'app-sign-in-step',
  imports: [RouterLink, Button, CodeEntry],
  template: `
    @if (restart()) {
      <h1 class="mb-4 text-3xl font-medium tracking-tight">
        {{ text.codeHeading }}
      </h1>
      <p class="text-muted" role="alert">{{ text.restart }}</p>
      <a appButton routerLink="/login" class="mt-8">{{ text.restartAction }}</a>
    } @else if (step(); as step) {
      <h1 class="mb-2 text-3xl font-medium tracking-tight">
        {{ text.codeHeading }}
      </h1>
      <app-code-entry
        [sent]="step"
        [intro]="text.codeIntro"
        [note]="step.confirming ? text.confirmNote : null"
        [rememberDays]="step.rememberDays"
        [submitCode]="submitCode"
        [resendCode]="resendCode"
        [retryAfter]="retryAfter"
        (done)="done.emit()"
        (restart)="restart.set(true)"
      />
    }
  `,
})
export class SignInStepPanel {
  private readonly auth = inject(AuthService);

  protected readonly text = inject(APP_TEXT).auth.signInStep;

  /** The session has started. */
  readonly done = output<void>();

  protected readonly restart = signal(false);
  protected readonly step = computed(() => this.auth.step());

  protected readonly submitCode = (code: string, remember: boolean) =>
    this.auth.submitCode(code, remember);
  protected readonly resendCode = () => this.auth.resendCode();
  protected readonly retryAfter = () => this.auth.retryAfter();
}
