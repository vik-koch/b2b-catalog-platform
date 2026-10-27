import { Component, inject, input, OnInit, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  PASSWORD_MIN_LENGTH,
  PasswordTokenPurpose,
} from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { usePageSeo } from '../../shared/core/page-seo';
import {
  confirmation,
  generatePassword,
  newPassword,
} from '../../shared/core/password';
import { AuthCard } from './auth-card';
import { Button } from '../../shared/ui/button';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { Input } from '../../shared/ui/input';
import { AuthService, CodeSendFailure } from '../../shared/auth/auth.service';
import { formatWait, SignInStepPanel } from './sign-in-step';
import { landingFor } from '../../shared/auth/auth.guard';
import { TextButton } from '../../shared/ui/text-button';
import { ConsentField } from '../pages/consent-field';
import { useConsent } from '../pages/consent';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';
import { Hint } from '../../shared/ui/hint';
import { PageIntro } from '../../shared/ui/page-intro';

type Status =
  | 'checking'
  | 'ready'
  | 'expired'
  | 'closed'
  | 'done'
  // The password is saved and a code is owed (FR-AUTH-12)…
  | 'step'
  // …or it is saved, but the code could not go out.
  | 'code-failed';

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
  imports: [
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
          <h1 appPageTitle class="mb-4">
            {{ step.codeHeading }}
          </h1>
          <p appPageIntro role="alert">{{ codeFailure() }}</p>
          <a appButton routerLink="/login" class="mt-8">
            {{ step.restartAction }}
          </a>
        }
        @case ('checking') {
          <p class="text-ink-subtle">{{ text.checking }}</p>
        }
        @case ('expired') {
          <h1 appPageTitle class="mb-4">
            {{ text.expiredHeading }}
          </h1>
          <p appPageIntro>{{ text.expired }}</p>
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
        @case ('closed') {
          <h1 appPageTitle class="mb-4">
            {{ text.closedHeading }}
          </h1>
          <p appPageIntro>{{ text.closed }}</p>
        }
        @case ('done') {
          <h1 appPageTitle class="mb-4">
            {{ text.successHeading }}
          </h1>
          <p appPageIntro>{{ text.success }}</p>
        }
        @default {
          <h1 appPageTitle class="mb-2">
            {{ purpose() === 'set' ? text.setHeading : text.resetHeading }}
          </h1>
          <p appPageIntro class="mb-4">
            {{ purpose() === 'set' ? text.setIntro : text.resetIntro }}
            <span class="mt-1 block">{{ text.forAccount }} {{ email() }}</span>
          </p>

          <form [formRoot]="form" class="space-y-6">
            <div>
              <!-- The length rule is stated up front, as on the change-password
                   form: it is the same sentence before and after the refusal,
                   and only its colour changes. -->
              <app-field
                [field]="form.newPassword"
                [label]="auth.password"
                [hint]="tooShort"
                [marker]="false"
                controlId="newPassword"
              >
                <button
                  appFieldAction
                  type="button"
                  appTextButton
                  class="text-sm"
                  (click)="revealed.set(!revealed())"
                >
                  {{ revealed() ? text.hide : text.show }}
                </button>
                <input
                  [type]="revealed() ? 'text' : 'password'"
                  autocomplete="new-password"
                  appInput
                  class="w-full"
                  [formField]="form.newPassword"
                />
              </app-field>
              <button
                type="button"
                appTextButton
                class="mt-2 text-sm"
                (click)="suggest()"
              >
                {{ text.generate }}
              </button>
              @if (suggested()) {
                <p appHint class="mt-1">{{ text.generated }}</p>
              }
            </div>

            <app-field
              [field]="form.confirmPassword"
              [label]="text.confirmPassword"
              [marker]="false"
              controlId="confirmPassword"
            >
              <input
                [type]="revealed() ? 'text' : 'password'"
                autocomplete="new-password"
                appInput
                class="w-full"
                [formField]="form.confirmPassword"
              />
            </app-field>

            <!-- The notice only beside the box: a reset owes no consent,
                 and the account's details were collected long before. -->
            <app-consent-field [consent]="consent" [alone]="false" />

            @if (rejection(); as message) {
              <p appErrorText role="alert">{{ message }}</p>
            }

            <button appButton type="submit" [disabled]="form().submitting()">
              {{ form().submitting() ? actionText.saving : text.submit }}
            </button>
          </form>
        }
      }
    </app-auth-card>
  `,
})
export class SetPasswordPage implements OnInit {
  private readonly service = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly auth = inject(STOREFRONT_TEXT).auth;
  protected readonly text = this.auth.setPassword;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly step = this.auth.signInStep;
  /** Why the code after the password did not go out. */
  protected readonly codeFailure = signal('');
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
  /** The account consent is still owed, and asked on this form. */
  private readonly consentRequired = signal(false);
  protected readonly consent = useConsent('account', this.consentRequired);
  protected readonly revealed = signal(false);
  protected readonly suggested = signal(false);
  /** The refusal to show under the field, once there is one. */
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

  /**
   * Fill both fields with a strong password and reveal it: a password nobody
   * can see is a password nobody can save, and the point of suggesting one is
   * that the visitor copies it into their manager.
   */
  protected suggest(): void {
    const password = generatePassword();
    this.model.set({ newPassword: password, confirmPassword: password });
    this.revealed.set(true);
    this.suggested.set(true);
  }

  private async send(): Promise<void> {
    if (this.consent.field().invalid() || !this.consent.sendable()) return;

    // The refusal stays until the next answer replaces it, so the form does
    // not jump while the request is out.
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
      this.codeFailure.set(this.codeFailureLine(outcome.failure));
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

  /** Straight to where this role belongs — the account is signed in. */
  protected async land(): Promise<void> {
    const user = this.service.user();
    await this.router.navigateByUrl(user ? landingFor(user.role) : '/');
  }

  private codeFailureLine(failure: CodeSendFailure): string {
    switch (failure) {
      case 'unreachable':
        return this.step.unreachableAccount;
      case 'unavailable':
        return this.step.unavailable;
      case 'limit':
        return this.step.limit.replace(
          '{time}',
          formatWait(this.service.retryAfter() ?? 0),
        );
    }
  }
}
