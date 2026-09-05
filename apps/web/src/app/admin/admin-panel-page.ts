import { Component, computed, inject, resource, signal } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { SignedInAs } from '../auth/signed-in-as';
import { ADMIN_TEXT } from '../config/admin-text';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { AdminIcon } from '../ui/icons/admin-icon';
import { BuildInfoService } from './build-info.service';
import { injectEditorReturnParams } from './editor-return';
import { MaintenanceToggle } from './maintenance/maintenance-toggle';
import { SyncService } from './sync/sync.service';
import { WorkNote } from '../work/work-note';
import { WorkService } from '../work/work.service';

/**
 * Admin panel — a small dashboard: the two staff-facing halves (orders and
 * accounts) side by side, then everything that changes shop content (the
 * catalog import, products and categories, the fixed static pages), then site
 * state (maintenance mode). Everything an admin can change is discoverable
 * from here, consistent with the storefront edit-mode affordances.
 */
@Component({
  selector: 'app-admin-panel-page',
  imports: [
    SignedInAs,
    MaintenanceToggle,
    RouterLink,
    Button,
    AdminIcon,
    WorkNote,
  ],
  template: `
    <h1 class="mb-4 text-3xl font-medium tracking-tight">
      {{ isAdmin() ? text.adminPanel : text.staffArea }}
    </h1>
    <app-signed-in-as />

    <!-- The two staff-facing halves side by side: neither holds enough buttons
         to earn a row of its own, and both are shown to managers, whose panel
         is these two cards and nothing else. Orders first — answering today's
         requests is the work, approving an account is occasional. First on the
         panel for the same reason: a manager has nothing else here, and an
         admin arriving at this screen is far more often answering an order
         than importing a catalog. Stacked below md, where two columns of
         buttons would each be too narrow. -->
    <div class="mt-10 grid gap-6 md:grid-cols-2">
      <section class="flex flex-col">
        <h2
          class="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase"
        >
          <app-admin-icon name="clipboard-list" class="h-4 w-4" />
          {{ panelText.orders }}
        </h2>
        <!-- Grows to its neighbour's height: side by side, two cards that end
             at different points read as one being unfinished. -->
        <!-- The count sits under the button that opens the list it counts
             (FR-WORK-03), as the sync's own caption does: it is a remark about
             that destination, not a second way in. -->
        <div
          class="flex grow flex-col items-start gap-3 rounded-lg border border-border p-5"
        >
          <a appButton variant="secondary" routerLink="/admin/orders">
            {{ orderText.title }}
          </a>
          @if (waitingOrders(); as count) {
            <app-work-note
              [label]="fill(panelText.workOrders, count)"
              link="/admin/orders"
              [queryParams]="{ status: 'requested' }"
            />
          }
        </div>
      </section>

      <section class="flex flex-col">
        <h2
          class="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase"
        >
          <app-admin-icon name="users" class="h-4 w-4" />
          {{ panelText.accounts }}
        </h2>
        <!-- Two buttons rather than one screen with tabs: they are two
             permissions, and a manager is only ever offered the one they
             have. -->
        <div
          class="flex grow flex-col items-start gap-3 rounded-lg border border-border p-5"
        >
          <div class="flex flex-wrap items-start gap-3">
            <a appButton variant="secondary" routerLink="/admin/users">
              {{ userText.titleCustomers }}
            </a>
            @if (isAdmin()) {
              <a appButton variant="secondary" routerLink="/admin/users/staff">
                {{ userText.titleStaff }}
              </a>
            }
          </div>
          <!-- Customers only, whichever role is looking: staff accounts are
               created already approved, so nothing waits on that list. -->
          @if (waitingRegistrations(); as count) {
            <app-work-note
              [label]="fill(panelText.workRegistrations, count)"
              link="/admin/users"
              [queryParams]="{ status: 'pending' }"
            />
          }
        </div>
      </section>
    </div>

    <!-- Everything that changes shop content lives in one card, in three rows
         of decreasing weight: what the shop sells and the papers that go with
         it (import, catalog, documents), then the registries behind them
         (attributes, pricing), then the static pages — a different kind of
         content, and more of them than fit one group.
         Admin-only — a manager's panel holds only the cards above. -->
    @if (isAdmin()) {
      <section class="mt-10">
        <!-- Section headings carry a muted glyph for the topic: the panel is a
             list of unrelated destinations, and the icon is what makes one
             findable at a glance. Only at this level — one per card. -->
        <h2
          class="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase"
        >
          <app-admin-icon name="package" class="h-4 w-4" />
          {{ panelText.manage }}
        </h2>
        <div class="rounded-lg border border-border">
          <!-- Three rows, and each is what it holds: the three big destinations
               abreast — the import, the catalog itself, the documents shown on
               it — then the two smaller registries under them, then the content
               pages. Not one four-column grid: the groups are of two different
               sizes, and squeezing them into equal tracks left a column
               carrying a single button beside one carrying three.
               Below lg the whole card is one column, six sections down the
               page in the order the work happens.
               Borders per cell rather than divide utilities, which count in DOM
               order and so draw a left edge down the middle of a wrapped
               row. -->
          <div class="grid lg:grid-cols-3">
            <div class="p-5">
              <h3 class="mb-3 text-sm font-medium">{{ panelText.sync }}</h3>
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

            <div class="border-t border-border p-5 lg:border-t-0 lg:border-l">
              <h3 id="admin-catalog-heading" class="mb-3 text-sm font-medium">
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
              <!-- Under the products button rather than beside the import that
                   fills the queue: publishing is what clears it. -->
              @if (waitingProducts(); as count) {
                <app-work-note
                  class="mt-3"
                  [label]="fill(panelText.workProducts, count)"
                  link="/admin/products"
                  [queryParams]="{ state: 'unpublished' }"
                />
              }
            </div>

            <!-- Documents are their own group rather than a third button in
                 the catalog's: they are files the shop holds, not the shape of
                 the catalog, and they are the only thing here that comes due —
                 which is a line of its own under the button that clears it. -->
            <div class="border-t border-border p-5 lg:border-t-0 lg:border-l">
              <h3 class="mb-3 text-sm font-medium">
                {{ panelText.documents }}
              </h3>
              <a appButton variant="secondary" routerLink="/admin/documents">
                {{ documentText.title }}
              </a>
              <!-- Expiring and expired counted as one figure, and the link
                   opens the list narrowed to exactly that pair. -->
              @if (waitingDocuments(); as count) {
                <app-work-note
                  class="mt-3"
                  [label]="fill(panelText.workDocuments, count)"
                  link="/admin/documents"
                  [queryParams]="{ expiry: 'due' }"
                />
              }
            </div>
          </div>

          <!-- The two registries: what the shop filters by, and what it
               charges. Both are settings behind the catalog rather than places
               an admin goes daily, so they sit under it in half-rows. -->
          <div class="grid border-t border-border lg:grid-cols-2">
            <div class="p-5">
              <h3
                id="admin-attributes-heading"
                class="mb-3 text-sm font-medium"
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

            <div class="border-t border-border p-5 lg:border-t-0 lg:border-l">
              <h3 class="mb-3 text-sm font-medium">
                {{ panelText.pricing }}
              </h3>
              <a appButton variant="secondary" routerLink="/admin/tiers">
                {{ tierText.title }}
              </a>
            </div>
          </div>

          <div class="border-t border-border p-5">
            <h3 id="admin-pages-heading" class="mb-3 text-sm font-medium">
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
                    [queryParams]="editorFrom()"
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

    @if (isAdmin()) {
      <section class="mt-10">
        <h2
          class="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase"
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
        class="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase"
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
  protected readonly documentText = inject(ADMIN_TEXT).documentList;
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

  private readonly work = inject(WorkService);

  /**
   * What is waiting, per queue (FR-WORK-03) — `undefined` where there is
   * nothing, so `@if` draws the line only when there is work. Zero and "not
   * your queue" are both nothing to show here; the difference matters to the
   * API, not to the card.
   */
  protected readonly waitingOrders = computed(
    () => this.work.counts().orders || undefined,
  );
  protected readonly waitingRegistrations = computed(
    () => this.work.counts().registrations || undefined,
  );
  protected readonly waitingProducts = computed(
    () => this.work.counts().unpublishedProducts || undefined,
  );
  protected readonly waitingDocuments = computed(
    () => this.work.counts().expiringDocuments || undefined,
  );

  protected fill(template: string, count: number): string {
    return fillText(template, { count });
  }

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
