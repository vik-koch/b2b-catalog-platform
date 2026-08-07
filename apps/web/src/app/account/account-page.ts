import { Component, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { SignedInAs } from '../auth/signed-in-as';

/**
 * The `user` role's landing page. Still a stub — it exists so login has one
 * destination per role rather than a conditional page.
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
