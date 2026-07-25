import { Component, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { SignedInAs } from '../auth/signed-in-as';

/**
 * Admin panel shell. A placeholder until the panel's own slices land
 * (change-password, static-page editing FR-ADM-03, then the catalog) — it
 * exists now so login has a real, role-gated destination to prove, and it is
 * where signing out lives (the navbar icon is a plain link).
 */
@Component({
  selector: 'app-admin-page',
  imports: [SignedInAs],
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">
      {{ text.adminPanel }}
    </h1>
    <app-signed-in-as />
    <p class="mt-4 text-stone-600">{{ text.underConstruction }}</p>
  `,
})
export class AdminPage {
  protected readonly text = inject(APP_TEXT).auth;
}
