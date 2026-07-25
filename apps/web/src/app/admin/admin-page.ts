import { Component, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { AuthService } from '../auth/auth.service';

/**
 * Admin panel shell. A placeholder until the panel's own slices land
 * (change-password, static-page editing FR-ADM-03, then the catalog) — it
 * exists now so login has a real, role-gated destination to prove.
 */
@Component({
  selector: 'app-admin-page',
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">
      {{ text.adminPanel }}
    </h1>
    <p class="text-stone-600">{{ text.underConstruction }}</p>
    @if (auth.user(); as user) {
      <p class="mt-2 text-sm text-stone-500">
        {{ user.email }} · {{ user.role }}
      </p>
    }
  `,
})
export class AdminPage {
  protected readonly auth = inject(AuthService);
  protected readonly text = inject(APP_TEXT).auth;
}
