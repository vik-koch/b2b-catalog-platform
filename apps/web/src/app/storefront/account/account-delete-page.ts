import { Component, computed, inject, resource, signal } from '@angular/core';
import { form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { AuthService } from '../../shared/auth/auth.service';
import { usePageSeo } from '../../shared/core/page-seo';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { Input } from '../../shared/ui/input';
import { AccountService } from './account.service';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { PageTitle } from '../../shared/ui/page-title';
import { ErrorText } from '../../shared/ui/error-text';
import { PageIntro } from '../../shared/ui/page-intro';

type Status = 'idle' | 'submitting' | 'wrong-password' | 'last-admin' | 'error';

/**
 * Deleting your own account (FR-AUTH-06). Its own route rather than a dialog:
 * the consequences take more words than a dialog should hold, and they are the
 * substance of the decision rather than a warning attached to it.
 *
 * The copy is deliberately literal about what "delete" means here — the account
 * closes and the personal details go, but past orders stay on the books with
 * the person removed from them (ADR 0032), and registering again later starts
 * a new account rather than restoring this one. Somebody who would mind that
 * should find it out here, not afterwards.
 */
@Component({
  selector: 'app-account-delete-page',
  imports: [
    FORM_FIELDS,
    RouterLink,
    Button,
    Input,
    PageTitle,
    ErrorText,
    PageIntro,
  ],
  template: `
    <div class="max-w-xl">
      @if (deleted()) {
        <h1 appPageTitle class="mb-4">
          {{ text.doneHeading }}
        </h1>
        <p appPageIntro>{{ text.done }}</p>
        <a appButton routerLink="/" class="mt-8">{{ home }}</a>
      } @else {
        <h1 appPageTitle class="mb-2">
          {{ text.heading }}
        </h1>
        <p appPageIntro class="mb-4">{{ text.intro }}</p>

        <ul class="mb-6 list-disc space-y-2 pl-5 text-sm text-ink-subtle">
          @for (line of text.consequences; track line) {
            <li>{{ line }}</li>
          }
        </ul>

        <!-- Only where there is something running. It is a warning rather than
             a refusal: the orders are the shop's to fill either way, and what
             changes is that they stop carrying the customer's details. -->
        @if (openOrders(); as open) {
          <p appErrorText class="mb-8" role="status">
            {{ openOrdersWarning(open) }}
          </p>
        }

        <form [formRoot]="form" class="space-y-6">
          <app-field
            [field]="form.password"
            [label]="password"
            [hint]="text.passwordHint"
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

          <div class="flex flex-wrap items-center gap-3">
            <!-- Destructive, and styled as such: this is the one control on the
                 account that cannot be taken back. -->
            <button
              appButton
              variant="danger"
              type="submit"
              [disabled]="status() === 'submitting'"
            >
              {{
                status() === 'submitting' ? actionText.deleting : text.submit
              }}
            </button>
            <a appButton variant="secondary" routerLink="/account">
              {{ text.cancel }}
            </a>
          </div>

          @if (message(); as failure) {
            <p appErrorText role="alert">{{ failure }}</p>
          }
        </form>
      }
    </div>
  `,
})
export class AccountDeletePage {
  private readonly account = inject(AccountService);
  private readonly auth = inject(AuthService);

  protected readonly text = inject(STOREFRONT_TEXT).account.delete;
  protected readonly password = inject(STOREFRONT_TEXT).auth.password;
  protected readonly validation = inject(STOREFRONT_TEXT).auth.validation;
  protected readonly home = inject(STOREFRONT_TEXT).errors.notFoundBack;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly status = signal<Status>('idle');
  protected readonly deleted = signal(false);

  /**
   * How many orders the shop is still working on for this account. Read from
   * the profile rather than counted here: it is a fact about the account, and
   * the page that says the consequences of deleting one should say the whole
   * of them.
   */
  private readonly profile = resource({
    params: () => true,
    loader: () => this.account.getProfile(),
  });
  protected readonly openOrders = computed(() =>
    this.profile.hasValue() ? (this.profile.value()?.openOrders ?? 0) : 0,
  );

  protected openOrdersWarning(count: number): string {
    return fillText(this.text.openOrders, { count });
  }

  protected readonly form = form(
    signal({ password: '' }),
    (request) => {
      required(request.password, {
        message: this.validation.currentPasswordRequired,
      });
    },
    { name: 'account-delete', submission: { action: () => this.send() } },
  );

  constructor() {
    usePageSeo({ name: () => this.text.heading });
  }

  /** The refusal to show, or null while there is none. */
  protected message(): string | null {
    switch (this.status()) {
      case 'wrong-password':
        return this.text.wrongPassword;
      case 'last-admin':
        return this.text.lastAdmin;
      case 'error':
        return this.text.error;
      default:
        return null;
    }
  }

  private async send(): Promise<void> {
    this.status.set('submitting');
    try {
      const result = await this.account.deleteAccount(
        this.form.password().value(),
      );
      if (result !== 'ok') {
        this.status.set(result);
        return;
      }
      // The server has already cleared the cookie and bumped tokenVersion; this
      // drops the local session so the chrome stops claiming a signed-in user.
      // Staying on the route rather than navigating: the guard would bounce a
      // signed-out visitor to /login, which is a poor way to learn it worked.
      await this.auth.logout();
      this.deleted.set(true);
    } catch {
      this.status.set('error');
    }
  }
}
