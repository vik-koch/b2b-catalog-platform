import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { usePageSeo } from '../core/page-seo';
import { ADMIN_TEXT } from '../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { SignedInAs } from '../auth/signed-in-as';
import { Button } from '../ui/button';
import { AdminIcon } from '../ui/icons/admin-icon';
import { MaintenanceToggle } from './maintenance/maintenance-toggle';
import { SyncService } from './sync/sync.service';
import { injectEditorReturnParams } from './editor-return';
import { BuildInfoService } from './build-info.service';

/**
 * Admin panel — a small dashboard over two cards: everything that changes shop
 * content (the catalog import, products and categories, the fixed static
 * pages), and site state (maintenance mode). Everything an admin can change is
 * discoverable from here, consistent with the storefront edit-mode affordances.
 */
@Component({
  selector: 'app-admin-panel-page',
  imports: [SignedInAs, MaintenanceToggle, RouterLink, Button, AdminIcon],
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">
      {{ text.adminPanel }}
    </h1>
    <app-signed-in-as />

    <!-- Everything that changes shop content lives in one card, in three tiers:
         ingest, then the catalog, then the static pages. The card is what makes
         them read as one block; the tiers keep the bulk import distinct from
         "open a thing and change it". No pencils — the whole card edits, so an
         icon on every button carries no information. -->
    <section class="mt-10">
      <h2
        class="mb-3 text-xs font-semibold tracking-wide text-subtle uppercase"
      >
        {{ panelText.manage }}
      </h2>
      <div class="divide-y divide-border rounded-lg border border-border">
        <div class="p-5">
          <h3 class="mb-3 text-sm font-semibold">{{ panelText.sync }}</h3>
          <a appButton routerLink="/admin/sync" class="gap-2">
            <app-admin-icon name="upload" class="h-4 w-4" />
            {{ syncText.title }}
          </a>
          <!-- The audit trail's newest applied run is the last-sync answer;
               there is no separate setting to keep in step. Until it arrives,
               hold the line's space rather than showing "never synced" and
               correcting it a moment later. -->
          @if (runs.isLoading()) {
            <div
              class="mt-3 h-5 w-48 animate-pulse rounded bg-stone-200"
              aria-hidden="true"
            ></div>
          } @else {
            <p class="mt-3 text-sm text-subtle">{{ lastSync() }}</p>
          }
        </div>

        <div class="p-5">
          <h3 id="admin-catalog-heading" class="mb-3 text-sm font-semibold">
            {{ panelText.catalog }}
          </h3>
          <ul
            class="flex flex-wrap gap-3"
            aria-labelledby="admin-catalog-heading"
          >
            <li>
              <a appButton variant="secondary" routerLink="/admin/categories">
                {{ categoryText.title }}
              </a>
            </li>
            <li>
              <a appButton variant="secondary" routerLink="/admin/products">
                {{ productText.title }}
              </a>
            </li>
          </ul>
        </div>

        <div class="p-5">
          <h3 class="mb-3 text-sm font-semibold">{{ panelText.pricing }}</h3>
          <a appButton variant="secondary" routerLink="/admin/tiers">
            {{ tierText.title }}
          </a>
        </div>

        <div class="p-5">
          <h3 id="admin-pages-heading" class="mb-3 text-sm font-semibold">
            {{ panelText.pages }}
          </h3>
          <!-- Named after its heading: several of these labels ("About us")
               also appear in the site header, so the group needs to be
               distinguishable to a screen reader moving through the page. -->
          <ul
            class="flex flex-wrap gap-3"
            aria-labelledby="admin-pages-heading"
          >
            @for (slug of pageSlugs; track slug) {
              <li>
                <!-- Straight into the editor: linking to the public page would
                     land an admin on a read-only view whose pencil only appears
                     when storefront edit mode happens to be on. -->
                <a
                  appButton
                  variant="secondary"
                  [routerLink]="['/admin/pages', slug, 'edit']"
                  [queryParams]="editorFrom"
                >
                  {{ navText[slug] }}
                </a>
              </li>
            }
          </ul>
        </div>
      </div>
    </section>

    <section class="mt-10">
      <h2
        class="mb-3 text-xs font-semibold tracking-wide text-subtle uppercase"
      >
        {{ panelText.site }}
      </h2>
      <app-maintenance-toggle />
    </section>

    <!-- What is running, in the quietest possible place: nobody comes to the
         panel for it, but it is the first thing asked when reporting a problem.
         Absent until it arrives — an empty footer line needs no placeholder. -->
    @if (buildInfo(); as info) {
      <p class="mt-10 text-xs text-subtle" [title]="info.title">
        {{ info.line }}
      </p>
    }
  `,
})
export class AdminPanelPage {
  private readonly sync = inject(SyncService);
  private readonly build = inject(BuildInfoService);
  protected readonly text = inject(APP_TEXT).auth;
  protected readonly panelText = inject(ADMIN_TEXT).panel;
  protected readonly productText = inject(ADMIN_TEXT).productList;
  protected readonly categoryText = inject(ADMIN_TEXT).categoryList;
  protected readonly tierText = inject(ADMIN_TEXT).tierList;
  protected readonly navText = inject(APP_TEXT).nav;
  protected readonly syncText = inject(ADMIN_TEXT).sync;
  // Only what this deployment publishes: an unpublished page has no route to
  // edit it against, so offering it here would be a dead end.
  protected readonly pageSlugs = inject(DEPLOYMENT_CONFIG).pages.published;
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  protected readonly editorFrom = injectEditorReturnParams();

  // Managers reach this page too, but the sync is admin-only — a 403 here is
  // expected, not an error, so the line simply stays absent for them.
  protected readonly runs = resource({
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

  // A dev deployment's version is the full `sha-<40 hex>` image tag — unreadable
  // inline, so it is shortened to the length people actually quote, with the
  // whole tag kept in the title for copying.
  private shorten(version: string): string {
    const sha = /^sha-([0-9a-f]{40})$/.exec(version);
    return sha ? `sha-${sha[1].slice(0, 7)}` : version;
  }

  protected readonly buildInfo = signal<{
    line: string;
    title: string;
  } | null>(null);

  private async loadBuildInfo(): Promise<void> {
    // Never worth an error state: the panel's own job is unaffected.
    const info = await this.build.get().catch(() => null);
    if (!info) return;

    const version = info.version
      ? this.panelText.version.replace('{version}', this.shorten(info.version))
      : this.panelText.versionUnknown;
    const deployed = info.deployedAt
      ? this.panelText.deployedAt.replace(
          '{date}',
          new Intl.DateTimeFormat(this.currency.locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(info.deployedAt)),
        )
      : null;

    this.buildInfo.set({
      line: deployed ? `${version} — ${deployed}` : version,
      title: info.version ?? '',
    });
  }

  constructor() {
    void this.loadBuildInfo();

    // Admin screens are client-rendered, so this is for the browser tab
    // rather than for crawlers — but it is the same one-line contract.
    usePageSeo({ name: () => this.text.adminPanel });
  }
}
