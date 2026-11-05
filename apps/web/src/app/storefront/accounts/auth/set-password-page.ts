import { STOREFRONT_ACCOUNTS_TEXT } from '../accounts-text';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { form } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { usePageSeo } from '../../../platform/page-seo';
import { confirmation, generatePassword, newPassword } from './password';
import { AuthCard } from './auth-card';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { AuthService } from '../../../platform/auth/auth.service';
import { SignInService } from './sign-in.service';
import { SignInStepPanel } from './sign-in-step';
import { sendFailureLine } from './send-failure-line';
import { landingFor } from '../../../platform/auth/auth.guard';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { ConsentField } from '../../site/consent-field';
import { useConsent } from '../../site/consent';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { Outcome } from '@b2b-catalog-platform/ui/content/outcome';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Hint } from '@b2b-catalog-platform/ui/fields/hint';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';
import { PASSWORD_MIN_LENGTH } from '@b2b-catalog-platform/shared/core/accounts';
import { PasswordTokenPurpose } from '@b2b-catalog-platform/shared/storefront/accounts';

type Status =
  | 'checking'
  | 'ready'
  | 'expired'
  | 'closed'
  | 'done'
  // Saved, and the step after the password is owed…
  | 'step'
  // …or saved, but its code could not go out.
  | 'code-failed';

/**
 * Where an invitation or a reset link lands: the link is the whole
 * credential. It is checked before the form shows, and the account's state,
 * not the URL, says whether this sets a first password or resets one.
 */
@Component({
  selector: 'app-set-password-page',
  imports: [
    Outcome,
    AuthCard,
    ConsentField,
    FORM_FIELDS,
    RouterLink,
    Button,
    Input,
    SignInStepPanel,
    TextButton,
    PageTitle,
    ErrorText,
    Hint,
    PageIntro,
  ],
  template: `
    <app-auth-card>
      @switch (status()) {
        @case ('step') {
          <app-sign-in-step (done)="land()" />
        }
        @case ('code-failed') {
          <ui-outcome
            [title]="step.codeHeading"
            [message]="codeFailure()"
            role="alert"
          >
            <a uiButton routerLink="/login">{{ step.restartAction }}</a>
          </ui-outcome>
        }
        @case ('checking') {
          <p class="text-ink-subtle">{{ text.checking }}</p>
        }
        @case ('expired') {
          <!-- A new link is primary: signing in is what they could not do in
               the first place. -->
          <ui-outcome [title]="text.expiredHeading" [message]="text.expired">
            <a uiButton routerLink="/forgot-password">
              {{ auth.forgotPassword.submit }}
            </a>
            <a uiButton variant="secondary" routerLink="/login">
              {{ auth.login }}
            </a>
          </ui-outcome>
        }
        @case ('closed') {
          <ui-outcome [title]="text.closedHeading" [message]="text.closed" />
        }
        @case ('done') {
          <ui-outcome [title]="text.successHeading" [message]="text.success" />
        }
        @default {
          <h1 uiPageTitle class="mb-2">
            {{ purpose() === 'set' ? text.setHeading : text.resetHeading }}
          </h1>
          <p uiPageIntro class="mb-4">
            {{ purpose() === 'set' ? text.setIntro : text.resetIntro }}
            <span class="mt-1 block">{{ text.forAccount }} {{ email() }}</span>
          </p>

          <form [formRoot]="form" class="space-y-6">
            <div>
              <!-- The rule up front: the refusal is the same sentence. -->
              <ui-field
                [field]="form.newPassword"
                [label]="auth.password"
                [hint]="tooShort"
                [marker]="false"
                controlId="newPassword"
              >
                <button
                  uiFieldAction
                  type="button"
                  uiTextButton
                  class="text-sm"
                  (click)="revealed.set(!revealed())"
                >
                  {{ revealed() ? text.hide : text.show }}
                </button>
                <input
                  [type]="revealed() ? 'text' : 'password'"
                  autocomplete="new-password"
                  uiInput
                  class="w-full"
                  [formField]="form.newPassword"
                />
              </ui-field>
              <button
                type="button"
                uiTextButton
                class="mt-2 text-sm"
                (click)="suggest()"
              >
                {{ text.generate }}
              </button>
              @if (suggested()) {
                <p uiHint class="mt-1">{{ text.generated }}</p>
              }
            </div>

            <ui-field
              [field]="form.confirmPassword"
              [label]="text.confirmPassword"
              [marker]="false"
              controlId="confirmPassword"
            >
              <input
                [type]="revealed() ? 'text' : 'password'"
                autocomplete="new-password"
                uiInput
                class="w-full"
                [formField]="form.confirmPassword"
              />
            </ui-field>

            <!-- No notice: the details were collected long before. -->
            <app-consent-field [consent]="consent" [alone]="false" />

            @if (rejection(); as message) {
              <p uiErrorText role="alert">{{ message }}</p>
            }

            <button uiButton type="submit" [disabled]="form().submitting()">
              {{ form().submitting() ? actionText.saving : text.submit }}
            </button>
          </form>
        }
      }
    </app-auth-card>
  `,
})
export class SetPasswordPage implements OnInit {
  private readonly service = inject(SignInService);
  private readonly session = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly auth = inject(STOREFRONT_ACCOUNTS_TEXT).auth;
  protected readonly text = this.auth.setPassword;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly step = this.auth.signInStep;
  /** Why the code after the password did not go out. */
  protected readonly codeFailure = signal('');
  protected readonly validation = this.auth.validation;
  private readonly rejected = this.auth.passwordRejected;
  protected readonly tooShort = fillText(
    this.auth.validation.newPasswordTooShort,
    { min: PASSWORD_MIN_LENGTH },
  );

  /** From the query string. */
  readonly token = input<string>('');

  protected readonly status = signal<Status>('checking');
  protected readonly purpose = signal<PasswordTokenPurpose>('set');
  protected readonly email = signal('');
  /** Still owed, and asked here. */
  private readonly consentRequired = signal(false);
  protected readonly consent = useConsent('account', this.consentRequired);
  protected readonly revealed = signal(false);
  protected readonly suggested = signal(false);
  protected readonly rejection = signal<string | null>(null);

  private readonly model = signal({ newPassword: '', confirmPassword: '' });
  protected readonly form = form(
    this.model,
    (password) => {
      newPassword(password.newPassword, {
        required: this.validation.newPasswordRequired,
        length: this.tooShort,
      });
      confirmation(
        password.confirmPassword,
        password.newPassword,
        this.validation.confirmPasswordMismatch,
      );
    },
    { name: 'set-password', submission: { action: () => this.send() } },
  );

  constructor() {
    usePageSeo({
      name: () =>
        this.purpose() === 'set'
          ? this.text.setHeading
          : this.text.resetHeading,
    });
  }

  async ngOnInit(): Promise<void> {
    const account = await this.service.checkPasswordToken(this.token());
    if (!account || account === 'closed') {
      this.status.set(account ?? 'expired');
      return;
    }
    this.purpose.set(account.purpose);
    this.email.set(account.email);
    this.consentRequired.set(account.consentRequired);
    this.status.set('ready');
  }

  /** Revealed, because the point is to copy it into a password manager. */
  protected suggest(): void {
    const password = generatePassword();
    this.model.set({ newPassword: password, confirmPassword: password });
    this.revealed.set(true);
    this.suggested.set(true);
  }

  private async send(): Promise<void> {
    if (this.consent.field().invalid() || !this.consent.sendable()) return;

    // The refusal stays until the next answer, so the form does not jump.
    const outcome = await this.service.setPassword({
      token: this.token(),
      password: this.model().newPassword,
      consentVersion: this.consent.version(),
    });
    const { result } = outcome;

    if (result === 'ok') {
      this.status.set('done');
      await this.land();
      return;
    }
    if (result === 'step') {
      this.status.set('step');
      return;
    }
    if (outcome.result === 'code') {
      this.codeFailure.set(
        sendFailureLine(
          this.step,
          outcome.failure,
          this.service.retryAfter() ?? 0,
        ),
      );
      this.status.set('code-failed');
      return;
    }
    if (result === 'expired' || result === 'closed') {
      this.status.set(result);
      return;
    }
    this.status.set('ready');
    // A consent refusal is explained beside the box.
    if (outcome.result === 'consent') {
      this.rejection.set(null);
      this.consent.refused(outcome.code);
      return;
    }
    this.rejection.set(
      outcome.result === 'rejected'
        ? this.rejected[outcome.code]
        : this.text.error,
    );
  }

  /** The account is signed in: straight to its role's home. */
  protected async land(): Promise<void> {
    const user = this.session.user();
    await this.router.navigateByUrl(user ? landingFor(user.role) : '/');
  }
}
