import { Component, computed, inject, resource, signal } from '@angular/core';
import { form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { AuthService } from '../../../shared/auth/auth.service';
import { usePageSeo } from '../../../shared/core/page-seo';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { AccountService } from './account.service';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { Outcome } from '@b2b-catalog-platform/ui/content/outcome';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';

type Status =
  'idle' | 'submitting' | 'wrong-password' | 'last-admin' | 'error' | 'done';

/** Deleting your own account: a page, not a dialog, because the consequences
 * are the decision. */
@Component({
  selector: 'app-account-delete-page',
  imports: [
    Outcome,
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
      @if (status() === 'done') {
        <ui-outcome [title]="text.doneHeading" [message]="text.done">
          <a uiButton routerLink="/">{{ home }}</a>
        </ui-outcome>
      } @else {
        <h1 uiPageTitle class="mb-2">
          {{ text.heading }}
        </h1>
        <p uiPageIntro class="mb-4">{{ text.intro }}</p>

        <ul class="mb-6 list-disc space-y-2 pl-5 text-sm text-ink-subtle">
          @for (line of text.consequences; track line) {
            <li>{{ line }}</li>
          }
        </ul>

        <!-- A warning, not a refusal: the shop fills the orders either way. -->
        @if (openOrders(); as open) {
          <p uiErrorText class="mb-8" role="status">
            {{ openOrdersWarning(open) }}
          </p>
        }

        <form [formRoot]="form" class="space-y-6">
          <ui-field
            [field]="form.password"
            [label]="password"
            [hint]="text.passwordHint"
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

          <div class="flex flex-wrap items-center gap-3">
            <button
              uiButton
              variant="danger"
              type="submit"
              [disabled]="status() === 'submitting'"
            >
              {{
                status() === 'submitting' ? actionText.deleting : text.submit
              }}
            </button>
            <a uiButton variant="secondary" routerLink="/account">
              {{ text.cancel }}
            </a>
          </div>

          @if (message(); as failure) {
            <p uiErrorText role="alert">{{ failure }}</p>
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
  private readonly validation = inject(STOREFRONT_TEXT).auth.validation;
  protected readonly home = inject(STOREFRONT_TEXT).errors.notFoundBack;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly status = signal<Status>('idle');

  private readonly profile = resource({
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
      // The server ended the session; this drops the local copy. Staying put:
      // the guard would bounce a signed-out visitor to /login.
      await this.auth.logout();
      this.status.set('done');
    } catch {
      this.status.set('error');
    }
  }
}
