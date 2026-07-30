import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PAGE_SLUGS } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { SignedInAs } from '../auth/signed-in-as';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { MaintenanceToggle } from './maintenance-toggle';

/**
 * Admin panel — a small dashboard grouping the editable surfaces into sections:
 * Catalog (products, categories), Content (the fixed static pages), and Site
 * (maintenance mode). Everything an admin can change is discoverable from here,
 * consistent with the storefront edit-mode affordances.
 */
@Component({
  selector: 'app-admin-page',
  imports: [SignedInAs, MaintenanceToggle, RouterLink, Button, LucideIcon],
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">
      {{ text.adminPanel }}
    </h1>
    <app-signed-in-as />

    <section class="mt-10">
      <h2
        class="mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase"
      >
        {{ panelText.catalog }}
      </h2>
      <div class="flex flex-wrap gap-3">
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
    </section>

    <section class="mt-10">
      <h2
        class="mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase"
      >
        {{ panelText.content }}
      </h2>
      <ul class="flex flex-wrap gap-3">
        @for (slug of pageSlugs; track slug) {
          <li>
            <a
              appButton
              variant="secondary"
              [routerLink]="['/', slug]"
              class="gap-2"
            >
              <app-lucide-icon name="pencil" class="h-4 w-4" />
              {{ navText[slug] }}
            </a>
          </li>
        }
      </ul>
    </section>

    <section class="mt-10">
      <h2
        class="mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase"
      >
        {{ panelText.site }}
      </h2>
      <app-maintenance-toggle />
    </section>
  `,
})
export class AdminPage {
  protected readonly text = inject(APP_TEXT).auth;
  protected readonly panelText = inject(APP_TEXT).adminPanel;
  protected readonly productText = inject(APP_TEXT).adminProducts;
  protected readonly categoryText = inject(APP_TEXT).adminCategories;
  protected readonly navText = inject(APP_TEXT).nav;
  protected readonly pageSlugs = PAGE_SLUGS;
}
