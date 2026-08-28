import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { usePageSeo } from '../core/page-seo';
import { ADMIN_TEXT } from '../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { AuthService } from '../auth/auth.service';
import { SignedInAs } from '../auth/signed-in-as';
import { Button } from '../ui/button';
import { AdminIcon } from '../ui/icons/admin-icon';
import { MaintenanceToggle } from './maintenance/maintenance-toggle';
import { SyncService } from './sync/sync.service';
import { injectEditorReturnParams } from './editor-return';
import { BuildInfoService } from './build-info.service';

/**
 * Admin panel — a small dashboard: everything that changes shop content (the
 * catalog import, products and categories, the fixed static pages), the two
 * staff-facing halves (orders and accounts) side by side, and site state
 * (maintenance mode). Everything an admin can change is discoverable from here,
 * consistent with the storefront edit-mode affordances.
 */
@Component({
  selector: 'app-admin-panel-page',
  imports: [SignedInAs, MaintenanceToggle, RouterLink, Button, AdminIcon],
  template: `
    <h1 class="mb-4 text-3xl font-bold tracking-tight">
      {{ isAdmin() ? text.adminPanel : text.staffArea }}
    </h1>
    <app-signed-in-as />

    <!-- Everything that changes shop content lives in one card: the three
         catalog-side groups side by side (ingest, catalog, pricing), the static
         pages on a row of their own beneath — they are a different kind of
         content and there are more of them than fit a third of the card.
         Admin-only — a manager's panel holds only the accounts card below. -->
    @if (isAdmin()) {
      <section class="mt-10">
        <!-- Section headings carry a muted glyph for the topic: the panel is a
             list of unrelated destinations, and the icon is what makes one
             findable at a glance. Only at this level — one per card. -->
        <h2
          class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-subtle uppercase"
        >
          <app-admin-icon name="package" class="h-4 w-4" />
          {{ panelText.manage }}
        </h2>
        <div class="rounded-lg border border-border">
          <!-- Four groups, one track each, in the order the work happens:
               import, then the catalog itself, then how its products are
               described, then what they cost. Stacked below sm, where the
               columns would each be too narrow for their buttons; the divider
               turns with them. -->
          <div
            class="grid divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0"
          >
            <div class="p-5">
              <h3 class="mb-3 text-sm font-semibold">{{ panelText.sync }}</h3>
              <a appButton routerLink="/admin/sync" class="gap-2">
                <app-admin-icon name="upload" class="h-4 w-4" />
                {{ syncText.title }}
              </a>
              <!-- Under the button, as a caption to it: the run it reports is
                   the one that button starts again. The audit trail's newest
                   applied run is the whole answer; there is no separate setting
                   to keep in step. Until it arrives, hold the line's space
                   rather than showing "never synced" and correcting it. -->
              @if (runs.isLoading()) {
                <div
                  class="mt-3 h-4 w-32 animate-pulse rounded bg-stone-200"
                  aria-hidden="true"
                ></div>
              } @else {
                <p class="mt-3 text-xs text-muted">{{ lastSync() }}</p>
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
                  <a
                    appButton
                    variant="secondary"
                    routerLink="/admin/categories"
                  >
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

            <!-- Attributes are their own group: one screen declares what the
                 shop filters by, the other shows what the products actually
                 carry. Both are about how a product is described rather than
                 about the catalog's structure. -->
            <div class="p-5">
              <h3
                id="admin-attributes-heading"
                class="mb-3 text-sm font-semibold"
              >
                {{ panelText.attributes }}
              </h3>
              <ul
                class="flex flex-wrap gap-3"
                aria-labelledby="admin-attributes-heading"
              >
                <li>
                  <a
                    appButton
                    variant="secondary"
                    routerLink="/admin/attributes"
                  >
                    {{ attributeText.title }}
                  </a>
                </li>
                <li>
                  <a
                    appButton
                    variant="secondary"
                    routerLink="/admin/attributes/inventory"
                  >
                    {{ inventoryText.title }}
                  </a>
                </li>
              </ul>
            </div>

            <div class="p-5">
              <h3 class="mb-3 text-sm font-semibold">
                {{ panelText.pricing }}
              </h3>
              <a appButton variant="secondary" routerLink="/admin/tiers">
                {{ tierText.title }}
              </a>
            </div>
          </div>

          <div class="border-t border-border p-5">
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
    }

    <!-- The two staff-facing halves side by side: neither holds enough buttons
         to earn a row of its own, and both are shown to managers, whose panel
         is these two cards and nothing else. Orders first — answering today's
         requests is the work, approving an account is occasional. Stacked below
         md, where two columns of buttons would each be too narrow. -->
    <div class="mt-10 grid gap-6 md:grid-cols-2">
      <section class="flex flex-col">
        <h2
          class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-subtle uppercase"
        >
          <app-admin-icon name="clipboard-list" class="h-4 w-4" />
          {{ panelText.orders }}
        </h2>
        <!-- Grows to its neighbour's height: side by side, two cards that end
             at different points read as one being unfinished. -->
        <div
          class="flex grow flex-wrap items-start gap-3 rounded-lg border border-border p-5"
        >
          <a appButton variant="secondary" routerLink="/admin/orders">
            {{ orderText.title }}
          </a>
        </div>
      </section>

      <section class="flex flex-col">
        <h2
          class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-subtle uppercase"
        >
          <app-admin-icon name="users" class="h-4 w-4" />
          {{ panelText.accounts }}
        </h2>
        <!-- Two buttons rather than one screen with tabs: they are two
             permissions, and a manager is only ever offered the one they
             have. -->
        <div
          class="flex grow flex-wrap items-start gap-3 rounded-lg border border-border p-5"
        >
          <a appButton variant="secondary" routerLink="/admin/users">
            {{ userText.titleCustomers }}
          </a>
          @if (isAdmin()) {
            <a appButton variant="secondary" routerLink="/admin/users/staff">
              {{ userText.titleStaff }}
            </a>
          }
        </div>
      </section>
    </div>

    @if (isAdmin()) {
      <section class="mt-10">
        <h2
          class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-subtle uppercase"
        >
          <app-admin-icon name="wrench" class="h-4 w-4" />
          {{ panelText.site }}
        </h2>
        <app-maintenance-toggle />
      </section>
    }

    <!-- The session's own password, in the same place a customer finds it. -->
    <section class="mt-10">
      <h2
        class="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-subtle uppercase"
      >
        <app-admin-icon name="lock" class="h-4 w-4" />
        {{ text.securityHeading }}
      </h2>
      <div class="rounded-lg border border-border p-5">
        <a appButton variant="secondary" routerLink="/change-password">
          {{ text.changePassword.heading }}
        </a>
      </div>
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
  private readonly auth = inject(AuthService);
  // A manager's panel is only the accounts card; everything else is admin-only.
  protected readonly isAdmin = computed(
    () => this.auth.user()?.role === 'admin',
  );
  protected readonly text = inject(APP_TEXT).auth;
  protected readonly panelText = inject(ADMIN_TEXT).panel;
  protected readonly productText = inject(ADMIN_TEXT).productList;
  protected readonly categoryText = inject(ADMIN_TEXT).categoryList;
  protected readonly attributeText = inject(ADMIN_TEXT).attributeList;
  protected readonly inventoryText = inject(ADMIN_TEXT).attributeInventory;
  protected readonly tierText = inject(ADMIN_TEXT).tierList;
  protected readonly userText = inject(ADMIN_TEXT).userList;
  protected readonly orderText = inject(ADMIN_TEXT).orderList;
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
    // Numeric and short: it sits in a chip, where a spelled-out month would
    // wrap. The sync screen itself carries the full timestamps.
    const date = new Intl.DateTimeFormat(this.currency.locale, {
      dateStyle: 'short',
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
    usePageSeo({
      name: () => (this.isAdmin() ? this.text.adminPanel : this.text.staffArea),
    });
  }
}
