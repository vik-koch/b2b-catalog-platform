import { STOREFRONT_ACCOUNTS_TEXT } from '../accounts-text';
import {
  Component,
  computed,
  inject,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { SignInService } from './sign-in.service';
import { CallWait } from './call-wait';
import { CodeEntry } from './code-entry';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { Outcome } from '@b2b-catalog-platform/ui/content/outcome';

/**
 * The step after the password, a code to enter or a call to make, shown in
 * place of the sign-in and set-password forms once the API says it is owed.
 */
@Component({
  selector: 'app-sign-in-step',
  imports: [Outcome, RouterLink, Button, CallWait, CodeEntry, PageTitle],
  template: `
    @if (restart()) {
      <ui-outcome [title]="heading()" [message]="text.restart" role="alert">
        <a uiButton routerLink="/login">{{ text.restartAction }}</a>
      </ui-outcome>
    } @else if (step(); as step) {
      @if (step.step === 'call') {
        <h1 uiPageTitle class="mb-2">
          {{ text.callHeading }}
        </h1>
        <app-call-wait
          [step]="step"
          [checkCall]="checkCall"
          [renewCall]="resendCode"
          [retryAfter]="retryAfter"
          (done)="done.emit()"
          (restart)="restart.set(true)"
        />
      } @else {
        <h1 uiPageTitle class="mb-2">
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
    }
  `,
})
export class SignInStepPanel {
  private readonly auth = inject(SignInService);

  protected readonly text = inject(STOREFRONT_ACCOUNTS_TEXT).auth.signInStep;

  /** The session has started. */
  readonly done = output<void>();

  protected readonly restart = signal(false);
  protected readonly step = this.auth.step;
  /** Kept once the step is gone, so the restart says which step ran out. */
  private readonly kind = linkedSignal<
    'code' | 'call' | undefined,
    'code' | 'call'
  >({
    source: () => this.step()?.step,
    computation: (kind, previous) => kind ?? previous?.value ?? 'code',
  });
  protected readonly heading = computed(() =>
    this.kind() === 'call' ? this.text.callHeading : this.text.codeHeading,
  );

  protected readonly submitCode = (code: string, remember: boolean) =>
    this.auth.submitCode(code, remember);
  protected readonly checkCall = (remember: boolean) =>
    this.auth.checkCall(remember);
  protected readonly resendCode = () => this.auth.resendCode();
  protected readonly retryAfter = () => this.auth.retryAfter();
}
