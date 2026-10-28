import { Component, inject, input, signal } from '@angular/core';
import { form, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { usePageSeo } from '../../shared/core/page-seo';
import { emailAddress } from '../../shared/core/field-rules';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { Input } from '../../shared/ui/input';
import { AuthCard } from './auth-card';
import { landingFor } from '../../shared/auth/auth.guard';
import { AuthService, LoginResult } from '../../shared/auth/auth.service';
import { formatWait, SignInStepPanel } from './sign-in-step';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';

/**
 * The one login form, for every role (FR-AUTH-07). Where it lands afterwards
 * is the only role-dependent part: back to the gated page that sent us here,
 * else the role's own home (see `landingFor`).
 */
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
      @if (status() === 'step') {
        <app-sign-in-step (done)="land()" />
      } @else {
        <h1 appPageTitle class="mb-8">
          {{ text.login }}
        </h1>

        <form [formRoot]="form" class="space-y-6">
          <!-- No required-marker beside either label: both fields are required,
             and marking every field on a form marks none of them. -->
          <app-field
            [field]="form.email"
            [label]="fields.email.label"
            [marker]="false"
            controlId="email"
          >
            <input
              type="email"
              autocomplete="email"
              appInput
              class="w-full"
              [formField]="form.email"
            />
          </app-field>

          <app-field
            [field]="form.password"
            [label]="text.password"
            [marker]="false"
            controlId="password"
          >
            <input
              type="password"
              autocomplete="current-password"
              appInput
              class="w-full"
              [formField]="form.password"
            />
          </app-field>

          @if (failure(); as message) {
            <p appErrorText role="alert">{{ message }}</p>
          }

          <div class="flex flex-wrap items-center gap-4">
            <button
              appButton
              type="submit"
              [disabled]="status() === 'submitting'"
            >
              {{ status() === 'submitting' ? text.submitting : text.submit }}
            </button>
            <!-- Beside the button, not under the password field: it is what you
               reach for after the login fails, which is where the eye already
               is. -->
            <a appTextButton routerLink="/forgot-password" class="text-sm">
              {{ text.forgotPassword.link }}
            </a>
          </div>
        </form>

        <div class="mt-10 border-t border-edge pt-6">
          <p class="mb-3 text-sm text-ink-subtle">
            {{ text.register.noAccount }}
          </p>
          <a appButton variant="secondary" routerLink="/register">
            {{ text.register.signUp }}
          </a>
        </div>
      }
    </app-auth-card>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly text = inject(STOREFRONT_TEXT).auth;
  protected readonly fields = inject(SHARED_TEXT).fields;
  protected readonly status = signal<'idle' | 'submitting' | LoginResult>(
    'idle',
  );

  /**
   * The last answer, kept while the next request is out: the message under the
   * form stays where it is until a new one replaces it, rather than vanishing
   * on the click and coming back a moment later.
   */
  private readonly answered = signal<'idle' | LoginResult>('idle');

  protected failure(): string | null {
    switch (this.answered()) {
      case 'invalid':
        return this.text.invalid;
      case 'closed':
        return this.text.closed;
      case 'error':
        return this.text.error;
      // The password was right, but the code could not go out.
      case 'unreachable':
        return this.text.signInStep.unreachableAccount;
      case 'unavailable':
        return this.text.signInStep.unavailable;
      case 'limit':
        return this.text.signInStep.limit.replace(
          '{time}',
          formatWait(this.auth.retryAfter() ?? 0),
        );
      default:
        return null;
    }
  }

  /** Set by the guards when they bounce a deep link here (query param). */
  readonly returnUrl = input<string>();

  protected readonly form = form(
    signal({ email: '', password: '' }),
    (login) => {
      required(login.email, { message: this.fields.email.required });
      emailAddress(login.email, this.fields.email.invalid);
      // Presence only: length and strength belong to the account that owns
      // the password, not to the form that signs in with it.
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
    this.status.set('submitting');
    const result = await this.auth.login(this.form().value());
    this.status.set(result);
    this.answered.set(result);

    if (result === 'ok') await this.land();
  }

  /** Signed in, by the password alone or after the code. */
  protected async land(): Promise<void> {
    const user = this.auth.user();
    await this.router.navigateByUrl(
      this.safeReturnUrl() ?? (user ? landingFor(user.role) : '/'),
    );
  }

  /**
   * Only same-origin paths are honoured — a `returnUrl` is attacker-supplied
   * (it rides in the URL), so anything that could name another host is an open
   * redirect. `//evil.example` is protocol-relative, hence the second check.
   */
  private safeReturnUrl(): string | null {
    const url = this.returnUrl();
    return url?.startsWith('/') && !url.startsWith('//') ? url : null;
  }
}
