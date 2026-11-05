import { STOREFRONT_ACCOUNTS_TEXT } from '../accounts-text';
import { Component, computed, inject, input, signal } from '@angular/core';
import { form, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { usePageSeo } from '../../../platform/page-seo';
import { emailAddress } from '../../../platform/field-rules';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { AuthCard } from './auth-card';
import { landingFor } from '../../../platform/auth/auth.guard';
import { AuthService } from '../../../platform/auth/auth.service';
import { LoginResult, SignInService } from './sign-in.service';
import { SignInStepPanel } from './sign-in-step';
import { sendFailureLine } from './send-failure-line';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';

/** The one login form for every role; only where it lands depends on it. */
@Component({
  selector: 'app-login-page',
  imports: [
    AuthCard,
    FORM_FIELDS,
    RouterLink,
    Button,
    Input,
    SignInStepPanel,
    TextButton,
    PageTitle,
    ErrorText,
  ],
  template: `
    <app-auth-card>
      @if (answered() === 'step') {
        <app-sign-in-step (done)="land()" />
      } @else {
        <h1 uiPageTitle class="mb-8">
          {{ text.login }}
        </h1>

        <form [formRoot]="form" class="space-y-6">
          <!-- No required marks: marking every field marks none. -->
          <ui-field
            [field]="form.email"
            [label]="fields.email.label"
            [marker]="false"
            controlId="email"
          >
            <input
              type="email"
              autocomplete="email"
              uiInput
              class="w-full"
              [formField]="form.email"
            />
          </ui-field>

          <ui-field
            [field]="form.password"
            [label]="text.password"
            [marker]="false"
            controlId="password"
          >
            <input
              type="password"
              autocomplete="current-password"
              uiInput
              class="w-full"
              [formField]="form.password"
            />
          </ui-field>

          @if (failure(); as message) {
            <p uiErrorText role="alert">{{ message }}</p>
          }

          <div class="flex flex-wrap items-center gap-4">
            <button uiButton type="submit" [disabled]="form().submitting()">
              {{ form().submitting() ? text.submitting : text.submit }}
            </button>
            <a uiTextButton routerLink="/forgot-password" class="text-sm">
              {{ text.forgotPassword.link }}
            </a>
          </div>
        </form>

        <div class="mt-10 border-t border-edge pt-6">
          <p class="mb-3 text-sm text-ink-subtle">
            {{ text.register.noAccount }}
          </p>
          <a uiButton variant="secondary" routerLink="/register">
            {{ text.register.signUp }}
          </a>
        </div>
      }
    </app-auth-card>
  `,
})
export class LoginPage {
  private readonly auth = inject(SignInService);
  private readonly session = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly text = inject(STOREFRONT_ACCOUNTS_TEXT).auth;
  protected readonly fields = inject(SHARED_TEXT).fields;
  /** The last answer, kept while the next request is out so the message
   * does not vanish and come back. */
  protected readonly answered = signal<'idle' | LoginResult>('idle');

  protected readonly failure = computed(() => {
    const answer = this.answered();
    switch (answer) {
      case 'idle':
      case 'ok':
      case 'step':
        return null;
      case 'invalid':
        return this.text.invalid;
      case 'closed':
        return this.text.closed;
      case 'error':
        return this.text.error;
      // The password was right, but the code could not go out.
      default:
        return sendFailureLine(
          this.text.signInStep,
          answer,
          this.auth.retryAfter() ?? 0,
        );
    }
  });

  /** Set by the guards when they bounce a deep link here. */
  readonly returnUrl = input<string>();

  protected readonly form = form(
    signal({ email: '', password: '' }),
    (login) => {
      required(login.email, { message: this.fields.email.required });
      emailAddress(login.email, this.fields.email.invalid);
      // Presence only: the policy is the account's, not the sign-in's.
      required(login.password, {
        message: this.text.validation.passwordRequired,
      });
    },
    { name: 'login', submission: { action: () => this.send() } },
  );

  constructor() {
    usePageSeo({ name: () => this.text.login });
  }

  private async send(): Promise<void> {
    const result = await this.auth.login(this.form().value());
    this.answered.set(result);

    if (result === 'ok') await this.land();
  }

  /** Signed in, by the password alone or after the code. */
  protected async land(): Promise<void> {
    const user = this.session.user();
    await this.router.navigateByUrl(
      this.safeReturnUrl() ?? (user ? landingFor(user.role) : '/'),
    );
  }

  /** Same-origin paths only: anything else is an open redirect, and
   * `//host` is protocol-relative. */
  private safeReturnUrl(): string | null {
    const url = this.returnUrl();
    return url?.startsWith('/') && !url.startsWith('//') ? url : null;
  }
}
