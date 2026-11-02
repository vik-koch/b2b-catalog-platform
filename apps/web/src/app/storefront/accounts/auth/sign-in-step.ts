import {
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { AuthService } from '../../shared/auth/auth.service';
import { CallWait } from './call-wait';
import { CodeEntry, formatWait } from './code-entry';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';

export { formatWait };

/**
 * The step after the password (FR-AUTH-12), wherever a password leads to a
 * session: the sign-in form and the set-password page show this in place of
 * their own form once the API says the step is owed — a code to enter, or a
 * call to make, whichever the deployment's provider takes.
 *
 * The step uses the number staff set. Nobody chooses another number here: a
 * holder who cannot use it asks the shop.
 */
@Component({
  selector: 'app-sign-in-step',
  imports: [RouterLink, Button, CallWait, CodeEntry, PageTitle, PageIntro],
  template: `
    @if (restart()) {
      <h1 uiPageTitle class="mb-4">
        {{ heading() }}
      </h1>
      <p uiPageIntro role="alert">{{ text.restart }}</p>
      <a uiButton routerLink="/login" class="mt-8">{{ text.restartAction }}</a>
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
  private readonly auth = inject(AuthService);

  protected readonly text = inject(STOREFRONT_TEXT).auth.signInStep;

  /** The session has started. */
  readonly done = output<void>();

  protected readonly restart = signal(false);
  protected readonly step = computed(() => this.auth.step());
  /** Kept once the step is gone, so the restart says which step ran out. */
  private readonly kind = signal<'code' | 'call'>('code');
  protected readonly heading = computed(() =>
    this.kind() === 'call' ? this.text.callHeading : this.text.codeHeading,
  );

  constructor() {
    effect(() => {
      const step = this.step();
      if (step) this.kind.set(step.step);
    });
  }

  protected readonly submitCode = (code: string, remember: boolean) =>
    this.auth.submitCode(code, remember);
  protected readonly checkCall = (remember: boolean) =>
    this.auth.checkCall(remember);
  protected readonly resendCode = () => this.auth.resendCode();
  protected readonly retryAfter = () => this.auth.retryAfter();
}
