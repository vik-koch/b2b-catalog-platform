import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PAGE_SLUGS } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { ADMIN_TEXT } from '../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { SignedInAs } from '../auth/signed-in-as';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { MaintenanceToggle } from './maintenance-toggle';
import { SyncService } from './sync.service';

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
        <a appButton variant="secondary" routerLink="/admin/sync" class="gap-2">
          <app-lucide-icon name="upload" class="h-4 w-4" />
          {{ syncText.title }}
        </a>
      </div>
      <!-- The audit trail's newest applied run is the last-sync answer; there
           is no separate setting to keep in step. -->
      <p class="mt-3 text-sm text-stone-500">{{ lastSync() }}</p>
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
  private readonly sync = inject(SyncService);
  protected readonly text = inject(APP_TEXT).auth;
  protected readonly panelText = inject(ADMIN_TEXT).panel;
  protected readonly productText = inject(ADMIN_TEXT).productList;
  protected readonly categoryText = inject(ADMIN_TEXT).categories;
  protected readonly navText = inject(APP_TEXT).nav;
  protected readonly syncText = inject(ADMIN_TEXT).sync;
  protected readonly pageSlugs = PAGE_SLUGS;
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  // Managers reach this page too, but the sync is admin-only — a 403 here is
  // expected, not an error, so the line simply stays absent for them.
  private readonly runs = resource({
    loader: () => this.sync.listRuns().catch(() => null),
  });

  protected readonly lastSync = computed(() => {
    const applied = this.runs.value()?.lastApplied;
    if (!applied?.finishedAt) return this.syncText.lastSyncNever;
    const date = new Intl.DateTimeFormat(this.currency.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(applied.finishedAt));
    return this.syncText.lastSync.replace('{date}', date);
  });
}
