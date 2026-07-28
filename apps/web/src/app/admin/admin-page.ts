import { Component, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { SignedInAs } from '../auth/signed-in-as';
import { MaintenanceToggle } from './maintenance-toggle';

/**
 * Admin panel shell. Fills in as the panel's slices land (static-page editing
 * FR-ADM-03, maintenance mode FR-ADM-04, then the catalog) — it exists as
 * login's role-gated destination, and is where signing out lives (the navbar
 * icon is a plain link).
 */
@Component({
  selector: 'app-admin-page',
  imports: [SignedInAs, MaintenanceToggle],
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">
      {{ text.adminPanel }}
    </h1>
    <app-signed-in-as />
    <app-maintenance-toggle class="mt-8 block" />
  `,
})
export class AdminPage {
  protected readonly text = inject(APP_TEXT).auth;
}
