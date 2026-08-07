import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { AuthService } from '../auth/auth.service';
import { FieldErrors } from '../core/form-errors';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { AccountService } from './account.service';

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
  imports: [ReactiveFormsModule, RouterLink, Button, FieldLabel, Input],
  template: `
    <div class="mx-auto max-w-xl">
      @if (deleted()) {
        <h1 class="mb-4 text-3xl font-bold tracking-tight">
          {{ text.doneHeading }}
        </h1>
        <p class="text-muted">{{ text.done }}</p>
        <a appButton routerLink="/" class="mt-8">{{ home }}</a>
      } @else {
        <h1 class="mb-2 text-3xl font-bold tracking-tight">
          {{ text.heading }}
        </h1>
        <p class="mb-6 text-muted">{{ text.intro }}</p>

        <ul class="mb-8 list-disc space-y-2 pl-5 text-sm text-muted">
          @for (line of text.consequences; track line) {
            <li>{{ line }}</li>
          }
        </ul>

        <form
          class="space-y-6"
          novalidate
          (ngSubmit)="submit()"
          [formGroup]="form"
        >
          <div>
            <label for="password" appFieldLabel>
              {{ text.password }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            <input
              id="password"
              type="password"
              formControlName="password"
              autocomplete="current-password"
              aria-required="true"
              appInput
              class="w-full"
              [attr.aria-invalid]="isInvalid() || null"
            />
            @if (isInvalid()) {
              <p class="mt-1 text-sm text-red-600">
                {{ validation.currentPasswordRequired }}
              </p>
            } @else {
              <p class="mt-1 text-sm text-muted">{{ text.passwordHint }}</p>
            }
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <!-- Destructive, and styled as such: this is the one control on the
                 account that cannot be taken back. -->
            <button
              appButton
              variant="danger"
              type="submit"
              [disabled]="status() === 'submitting'"
            >
              {{ status() === 'submitting' ? text.submitting : text.submit }}
            </button>
            <a appButton variant="secondary" routerLink="/account">
              {{ text.cancel }}
            </a>
          </div>

          @if (message(); as failure) {
            <p class="text-sm text-red-600" role="alert">{{ failure }}</p>
          }
        </form>
      }
    </div>
  `,
})
export class AccountDeletePage {
  private readonly fb = inject(FormBuilder);
  private readonly account = inject(AccountService);
  private readonly auth = inject(AuthService);

  protected readonly text = inject(APP_TEXT).auth.myAccount.delete;
  protected readonly validation = inject(APP_TEXT).auth.validation;
  protected readonly home = inject(APP_TEXT).errors.notFoundBack;
  protected readonly status = signal<Status>('idle');
  protected readonly deleted = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    password: ['', Validators.required],
  });
  private readonly fieldErrors = new FieldErrors(this.form);

  constructor() {
    usePageSeo({ name: () => this.text.heading });
  }

  protected isInvalid(): boolean {
    return this.fieldErrors.show(this.form.controls.password);
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

  protected async submit(): Promise<void> {
    this.fieldErrors.markSubmitted();
    if (this.form.invalid) return;

    this.status.set('submitting');
    try {
      const result = await this.account.deleteAccount(
        this.form.getRawValue().password,
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
