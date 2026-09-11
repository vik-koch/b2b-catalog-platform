import { Component, computed, inject, resource, signal } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { SignedInAs } from '../auth/signed-in-as';
import { ADMIN_TEXT } from '../config/admin-text';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { usePageSeo } from '../core/page-seo';
import { AdminIcon } from '../ui/icons/admin-icon';
import { StatusBadge } from '../ui/status-badge';
import { WorkNote } from '../work/work-note';
import { WorkService } from '../work/work.service';
import { BuildInfoService } from './build-info.service';
import { injectEditorReturnParams } from './editor-return';
import { adminMomentFormat } from './grid/admin-date';
import { PanelRow } from './panel-row';
import { SettingsService } from './settings/settings.service';
import { SyncService } from './sync/sync.service';

/**
 * Admin panel — a small dashboard: the two staff-facing halves (orders and
 * accounts) side by side, then everything that changes shop content (the
 * catalog import, products and categories, the fixed static pages), then site
 * state. Everything an admin can change is discoverable
 * from here, consistent with the storefront edit-mode affordances.
 */
@Component({
  selector: 'app-admin-panel-page',
  imports: [SignedInAs, AdminIcon, PanelRow, StatusBadge, WorkNote],
  template: `
    <!-- Narrower than the shell allows. The panel is a column of short lists,
         and at the full width of a desktop each card was a name on the left
         and half a screen of nothing beside it. -->
    <div class="max-w-3xl">
      <h1 class="mb-4 text-3xl font-medium tracking-tight">
        {{ isAdmin() ? text.adminPanel : text.staffArea }}
      </h1>
      <app-signed-in-as />

      <!-- Every section is a heading with a glyph and a card of rows beneath
           it, and every card puts what it has to say on its own right-hand
           axis.

           Two columns that fill independently, not a grid of aligned rows:
           aligned, every card started on the line the tallest card of its row
           ended on, so the one-row orders card left a hole beneath it as deep
           as the two-row accounts card beside it. Two columns rather than a
           multi-column flow, because which card sits under which is the point
           — the catalog belongs under the orders, not wherever a balancing
           algorithm puts it.

           Below md the two stack, so the left column is read through before
           the right. -->
      <div class="mt-10 grid items-start gap-x-6 gap-y-8 md:grid-cols-2">
        <div class="flex flex-col gap-8">
          <!-- Orders first, and in the panel's only filled button: answering
               today's requests is the work. A manager has nothing here but this
               card and the accounts beside it, and an admin arriving at this
               screen is far more often answering an order than importing a
               catalog. -->
          <section>
            <h2 id="admin-orders-heading" [class]="headingClass">
              <app-admin-icon name="clipboard-list" class="h-4 w-4" />
              {{ panelText.orders }}
            </h2>
            <ul [class]="cardClass" aria-labelledby="admin-orders-heading">
              <app-panel-row [label]="orderText.title" link="/admin/orders">
                <!-- Two queues, one screen: an order nobody has answered and
                     one handed over that nobody has been paid for are two
                     jobs with two lists, so they are two notes stacked on the
                     row's right-hand axis rather than one figure over both. -->
                <div class="flex flex-col items-end gap-0.5">
                  @if (waitingOrders(); as count) {
                    <app-work-note
                      [label]="fill(panelText.workOrders, count)"
                      link="/admin/orders"
                      [queryParams]="{ status: 'requested' }"
                    />
                  }
                  @if (unpaidOrders(); as count) {
                    <app-work-note
                      [label]="fill(panelText.workUnpaid, count)"
                      link="/admin/orders"
                      [queryParams]="{ status: 'completed', payment: 'unpaid' }"
                    />
                  }
                </div>
              </app-panel-row>
            </ul>
          </section>

          @if (isAdmin()) {
            <!-- What the shop sells and the papers that go with it, with the
                 import that fills it at the foot: the four are one topic, and
                 the sub-headings that used to separate them only repeated the
                 button underneath. -->
            <section>
              <h2 id="admin-catalog-heading" [class]="headingClass">
                <app-admin-icon name="package" class="h-4 w-4" />
                {{ panelText.catalog }}
              </h2>
              <ul [class]="cardClass" aria-labelledby="admin-catalog-heading">
                <app-panel-row
                  [label]="categoryText.title"
                  link="/admin/categories"
                />
                <app-panel-row
                  [label]="productText.title"
                  link="/admin/products"
                >
                  @if (waitingProducts(); as count) {
                    <app-work-note
                      [label]="fill(panelText.workProducts, count)"
                      link="/admin/products"
                      [queryParams]="{ state: 'unpublished' }"
                    />
                  }
                </app-panel-row>
                <!-- Two notes, as the orders row has: a certificate that has
                     already lapsed is the shop out of compliance today, one
                     about to lapse is notice — and each opens the list on its
                     own filter. -->
                <app-panel-row
                  [label]="documentText.title"
                  link="/admin/documents"
                >
                  <div class="flex flex-col items-end gap-0.5">
                    @if (expiredDocuments(); as count) {
                      <app-work-note
                        [label]="fill(panelText.workDocumentsExpired, count)"
                        link="/admin/documents"
                        [queryParams]="{ status: 'expired' }"
                      />
                    }
                    @if (waitingDocuments(); as count) {
                      <app-work-note
                        [label]="fill(panelText.workDocuments, count)"
                        link="/admin/documents"
                        [queryParams]="{ status: 'expiring' }"
                      />
                    }
                  </div>
                </app-panel-row>
                <!-- The run it reports is the one this row starts again. The
                     audit trail's newest applied run is the whole answer; until
                     it arrives, hold the line's space rather than showing
                     "never synced" and correcting it — and hold exactly the
                     width the answer takes, which is one timestamp. -->
                <app-panel-row [label]="syncText.title" link="/admin/sync">
                  @if (runs.isLoading()) {
                    <span
                      class="block h-3 w-24 animate-pulse rounded bg-stone-200"
                      aria-hidden="true"
                    ></span>
                  } @else {
                    <span class="flex text-xs text-muted">{{
                      lastSync()
                    }}</span>
                  }
                </app-panel-row>
              </ul>
            </section>

            <!-- The static pages, their own section with their own glyph: they
                 are a different kind of content from the catalog, and there are
                 more of them than belong at the foot of another card.
                 Straight into the editor: linking to the public page would land
                 an admin on a read-only view whose pencil only appears when
                 storefront edit mode happens to be on. -->
            <section>
              <h2 id="admin-pages-heading" [class]="headingClass">
                <app-admin-icon name="file-text" class="h-4 w-4" />
                {{ panelText.pages }}
              </h2>
              <ul [class]="cardClass" aria-labelledby="admin-pages-heading">
                @for (slug of pageSlugs; track slug) {
                  <app-panel-row
                    [label]="navText[slug]"
                    [link]="['/admin/pages', slug, 'edit']"
                    [queryParams]="editorFrom()"
                  />
                }
              </ul>
            </section>
          }
        </div>

        <div class="flex flex-col gap-8">
          <!-- Two rows rather than one screen with tabs: they are two
               permissions, and a manager is only ever offered the one they
               have. Only customers can be waiting — staff accounts are created
               already approved. -->
          <section>
            <h2 id="admin-accounts-heading" [class]="headingClass">
              <app-admin-icon name="users" class="h-4 w-4" />
              {{ panelText.accounts }}
            </h2>
            <ul [class]="cardClass" aria-labelledby="admin-accounts-heading">
              <app-panel-row
                [label]="userText.titleCustomers"
                link="/admin/users"
              >
                @if (waitingRegistrations(); as count) {
                  <app-work-note
                    [label]="fill(panelText.workRegistrations, count)"
                    link="/admin/users"
                    [queryParams]="{ status: 'pending' }"
                  />
                }
              </app-panel-row>
              @if (isAdmin()) {
                <app-panel-row
                  [label]="userText.titleStaff"
                  link="/admin/users/staff"
                />
              }
            </ul>
          </section>

          @if (isAdmin()) {
            <!-- The registries behind the catalog: what the shop filters by, and
                 what it charges. Settings rather than places an admin goes
                 daily, and one card because that is what they have in common —
                 "Pricing" over a single row named "Customer tiers" said the
                 same thing twice. -->
            <section>
              <h2 id="admin-registries-heading" [class]="headingClass">
                <app-admin-icon name="funnel" class="h-4 w-4" />
                {{ panelText.registries }}
              </h2>
              <ul
                [class]="cardClass"
                aria-labelledby="admin-registries-heading"
              >
                <app-panel-row
                  [label]="attributeText.title"
                  link="/admin/attributes"
                />
                <app-panel-row
                  [label]="inventoryText.title"
                  link="/admin/attributes/inventory"
                />
                <app-panel-row [label]="tierText.title" link="/admin/tiers" />
              </ul>
            </section>

            <!-- How the shop is running, and what it lets in from outside.
                 One section rather than two: "Maintenance mode" was a heading
                 that could only ever name the single card under it, and the
                 switches moved onto a page of their own once they had a shared
                 history to sit above. -->
            <section>
              <h2 id="admin-operations-heading" [class]="headingClass">
                <app-admin-icon name="wrench" class="h-4 w-4" />
                {{ panelText.operations }}
              </h2>
              <ul
                [class]="cardClass"
                aria-labelledby="admin-operations-heading"
              >
                <!-- The only two runtime states an admin can forget they
                     left on, said where they will be seen without going
                     looking: the panel is the first screen of every admin
                     session. Shown only while true — a row that always
                     carries "maintenance off" is a row nobody reads. -->
                <app-panel-row
                  [label]="operationsText.title"
                  link="/admin/operations"
                >
                  <!-- Stacked, never side by side: the row's right-hand slot
                       does not shrink, so two chips in a line ran off a 375px
                       screen. Reading down is what this column does anyway —
                       the work notes stack here too, and the row's padding is
                       already cut for it. -->
                  <span class="flex flex-col items-end gap-1">
                    @if (maintenanceOn()) {
                      <span appStatusBadge tone="danger">
                        {{ panelText.maintenanceOn }}
                      </span>
                    }
                    @if (catalogOwned()) {
                      <span appStatusBadge tone="info">
                        {{ panelText.catalogOwned }}
                      </span>
                    }
                  </span>
                </app-panel-row>
                <app-panel-row
                  [label]="apiTokenText.title"
                  link="/admin/api-tokens"
                />
              </ul>
            </section>
          }

          <!-- The session's own password, in the same place a customer finds
               it — and at the foot of this column since the maintenance card
               left, which is where a setting about yourself belongs anyway. -->
          <section>
            <h2 id="admin-security-heading" [class]="headingClass">
              <app-admin-icon name="lock" class="h-4 w-4" />
              {{ text.securityHeading }}
            </h2>
            <ul [class]="cardClass" aria-labelledby="admin-security-heading">
              <app-panel-row
                [label]="text.changePassword.heading"
                link="/change-password"
              />
            </ul>
          </section>
        </div>
      </div>

      <!-- What is running, in the quietest possible place: nobody comes to the
           panel for it, but it is the first thing asked when reporting a
           problem. Absent until it arrives — an empty footer line needs no
           placeholder. -->
      @if (buildInfo(); as info) {
        <p class="mt-10 text-xs text-subtle" [title]="info.title">
          {{ info.line }}
        </p>
      }
    </div>
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
  protected readonly apiTokenText = inject(ADMIN_TEXT).apiTokenList;
  protected readonly operationsText = inject(ADMIN_TEXT).operations;
  protected readonly userText = inject(ADMIN_TEXT).userList;
  protected readonly orderText = inject(ADMIN_TEXT).orderList;
  protected readonly navText = inject(APP_TEXT).nav;
  protected readonly syncText = inject(ADMIN_TEXT).sync;
  // Only what this deployment publishes: an unpublished page has no route to
  // edit it against, so offering it here would be a dead end.
  protected readonly pageSlugs = inject(DEPLOYMENT_CONFIG).pages.published;
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  protected readonly editorFrom = injectEditorReturnParams();

  /** One heading, one card frame, written once: seven sections spelling the
   * same two class lists is seven chances for one of them to drift. */
  protected readonly headingClass =
    'mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase';
  /** `overflow-hidden` because a row's hover ground is a square: without it
   * the first and last row paint their corners over the card's rounding. */
  protected readonly cardClass =
    'divide-y divide-border overflow-hidden rounded-lg border border-border';

  private readonly work = inject(WorkService);
  private readonly settings = inject(SettingsService);

  /**
   * The runtime switches, for the chips beside the operations row. Null until
   * the read lands, and null forever for a manager — who never sees that card
   * and is refused the endpoint behind it.
   */
  protected readonly maintenanceOn = computed(
    () => this.settings.settings()?.maintenanceEnabled ?? false,
  );
  protected readonly catalogOwned = computed(
    () => this.settings.settings()?.ownedAreas.includes('catalog') ?? false,
  );

  /**
   * What is waiting, per queue (FR-WORK-03) — `undefined` where there is
   * nothing, so `@if` draws the line only when there is work. Zero and "not
   * your queue" are both nothing to show here; the difference matters to the
   * API, not to the card.
   */
  protected readonly waitingOrders = computed(
    () => this.work.counts().orders || undefined,
  );
  protected readonly unpaidOrders = computed(
    () => this.work.counts().unpaidOrders || undefined,
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
  protected readonly expiredDocuments = computed(
    () => this.work.counts().expiredDocuments || undefined,
  );

  protected fill(template: string, count: number): string {
    return fillText(template, { count });
  }

  // Managers reach this page too, but the sync is admin-only — a 403 here is
  // expected, not an error, so the line simply stays absent for them.
  protected readonly runs = resource({
    loader: () => this.sync.listRuns().catch(() => null),
  });

  /**
   * When the catalog was last synced — the timestamp and nothing else.
   *
   * No "Last sync:" in front of it: the row it sits on is already the sync
   * row, and the label would be the row's own name said twice. The one reading
   * that is not a date says so in words, because an empty-looking line there
   * would read as a figure that failed to load.
   */
  protected readonly lastSync = computed(() => {
    const applied = this.runs.value()?.lastApplied;
    if (!applied?.finishedAt) return this.syncText.lastSyncNever;
    return adminMomentFormat(this.currency.locale).format(
      new Date(applied.finishedAt),
    );
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
    // Admin-only, and deliberately not for a manager: the read is refused for
    // them, and the failure is what tells the editors to lock every field.
    if (this.isAdmin()) void this.settings.load();

    // Admin screens are client-rendered, so this is for the browser tab
    // rather than for crawlers — but it is the same one-line contract.
    usePageSeo({
      name: () => (this.isAdmin() ? this.text.adminPanel : this.text.staffArea),
    });
  }
}
