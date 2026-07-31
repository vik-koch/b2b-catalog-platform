import { Component, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { SignedInAs } from '../auth/signed-in-as';

/**
 * The `user` role's landing page. A stub on purpose: in this iteration the
 * bootstrap admin is the only account that exists (FR-AUTH-07), so nothing can
 * reach it yet. It is here so login has one destination per role from the
 * start, rather than a conditional page that grows a second mode in iteration 4
 * when real user accounts (FR-AUTH-01…06) arrive.
 */
@Component({
  selector: 'app-account-page',
  imports: [SignedInAs],
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">{{ text.account }}</h1>
    <app-signed-in-as />
    <p class="mt-4 text-muted">{{ text.underConstruction }}</p>
  `,
})
export class AccountPage {
  protected readonly text = inject(APP_TEXT).auth;
}
