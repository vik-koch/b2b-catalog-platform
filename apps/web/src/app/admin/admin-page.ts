import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { SignedInAs } from '../auth/signed-in-as';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { MaintenanceToggle } from './maintenance-toggle';

/**
 * Admin panel shell. Fills in as the panel's slices land (static-page editing
 * FR-ADM-03, maintenance mode FR-ADM-04, then the catalog) — it exists as
 * login's role-gated destination, and is where signing out lives (the navbar
 * icon is a plain link).
 */
@Component({
  selector: 'app-admin-page',
  imports: [SignedInAs, MaintenanceToggle, RouterLink, Button, LucideIcon],
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">
      {{ text.adminPanel }}
    </h1>
    <app-signed-in-as />
    <div class="mt-8 flex flex-wrap gap-3">
      <a appButton routerLink="/admin/products" class="gap-2">
        <app-lucide-icon name="pencil" class="h-4 w-4" />
        {{ productText.title }}
      </a>
      <a
        appButton
        variant="secondary"
        routerLink="/admin/categories"
        class="gap-2"
      >
        <app-lucide-icon name="pencil" class="h-4 w-4" />
        {{ categoryText.title }}
      </a>
    </div>
    <app-maintenance-toggle class="mt-8 block" />
  `,
})
export class AdminPage {
  protected readonly text = inject(APP_TEXT).auth;
  protected readonly productText = inject(APP_TEXT).adminProducts;
  protected readonly categoryText = inject(APP_TEXT).adminCategories;
}
