import { ADMIN_ORDERING_TEXT } from '../ordering/ordering-text';
import { ADMIN_ACCOUNTS_TEXT } from '../accounts/accounts-text';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CONSENT_PAGE_SLUGS,
  CONSENT_PURPOSES,
  ConsentPurpose,
} from '@b2b-catalog-platform/shared/core/site';
import { SyncArea } from '@b2b-catalog-platform/shared/core/exchange';
import {
  OWNERSHIP_AREAS,
  OwnershipArea,
  fillText,
} from '@b2b-catalog-platform/shared/platform';
import { AuthService } from '../../platform/auth/auth.service';
import { SignedInAs } from '../../core/accounts/auth/signed-in-as';
import { ADMIN_TEXT } from '../../platform/config/admin-text';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { usePageSeo } from '../../platform/page-seo';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { ActionLink } from '@b2b-catalog-platform/ui/actions/action-link';
import { WorkService } from '../../core/work/work.service';
import { BuildInfoService } from '../platform/build-info.service';
import { injectEditorReturnParams } from '../../platform/edit-mode/editor-return';
import { adminMomentFormat } from '../platform/dates/admin-date';
import { PanelCard } from './panel-card';
import { PanelRow } from './panel-row';
import { OwnershipService } from '../platform/ownership/ownership.service';
import { MaintenanceSwitchService } from '../site/maintenance-switch.service';
import { SyncService } from '../exchange/sync.service';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { bookCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/book-check';
import { clipboardListIcon } from '@b2b-catalog-platform/ui/icons/glyphs/clipboard-list';
import { fileTextIcon } from '@b2b-catalog-platform/ui/icons/glyphs/file-text';
import { funnelIcon } from '@b2b-catalog-platform/ui/icons/glyphs/funnel';
import { lockIcon } from '@b2b-catalog-platform/ui/icons/glyphs/lock';
import { packageIcon } from '@b2b-catalog-platform/ui/icons/glyphs/package';
import { usersIcon } from '@b2b-catalog-platform/ui/icons/glyphs/users';
import { wrenchIcon } from '@b2b-catalog-platform/ui/icons/glyphs/wrench';
import { SITE_CONFIG } from '../../core/site/site-config';
import { ADMIN_CATALOG_TEXT } from '../catalog/catalog-text';

/**
 * The staff's first screen: orders and accounts, then what changes the shop's
 * content, then how it runs. A manager sees orders, accounts and security.
 */
@Component({
  selector: 'app-admin-panel-page',
  imports: [
    SignedInAs,
    PanelCard,
    PanelRow,
    StatusBadge,
    ActionLink,
    PageTitle,
    RouterLink,
  ],
  template: `
    <!-- Narrower than the shell: at full width a card is a name and half a
         screen of nothing. -->
    <div class="max-w-3xl">
      <h1 uiPageTitle class="mb-4">{{ title() }}</h1>
      <app-signed-in-as />

      <!-- Two columns that fill independently, so a short card leaves no hole
           beside a tall one, and keep which card sits under which. Below md
           they dissolve (contents) and \`order\` interleaves the cards. -->
      <div class="mt-7 grid items-start gap-x-6 gap-y-6.5 md:grid-cols-2">
        <div class="contents md:flex md:flex-col md:gap-6.5">
          <app-panel-card
            key="orders"
            class="order-1 md:order-0"
            [heading]="panelText.orders"
            [glyph]="clipboardListIcon"
          >
            <app-panel-row
              stacked
              [label]="orderText.page.title"
              link="/admin/orders"
            >
              @if (counts().orders; as count) {
                <a
                  uiActionLink
                  routerLink="/admin/orders"
                  [queryParams]="{ status: 'requested' }"
                  >{{ fill(panelText.workOrders, count) }}</a
                >
              }
              @if (counts().unpaidOrders; as count) {
                <a
                  uiActionLink
                  routerLink="/admin/orders"
                  [queryParams]="{ status: 'completed', payment: 'unpaid' }"
                  >{{ fill(panelText.workUnpaid, count) }}</a
                >
              }
            </app-panel-row>
            <!-- No waiting count: an order update applies as it arrives. -->
            <app-panel-row
              [label]="syncText.areas.orders.title"
              link="/admin/sync/orders"
            >
              @if (lastSync().orders; as moment) {
                <span class="flex text-xs text-ink-subtle">{{ moment }}</span>
              }
            </app-panel-row>
          </app-panel-card>

          @if (isAdmin()) {
            <app-panel-card
              key="catalog"
              class="order-3 md:order-0"
              [heading]="panelText.catalog"
              [glyph]="packageIcon"
            >
              <app-panel-row
                [label]="categoryText.page.title"
                link="/admin/categories"
              />
              <app-panel-row
                stacked
                [label]="productText.page.title"
                link="/admin/products"
              >
                @if (counts().unpublishedProducts; as count) {
                  <a
                    uiActionLink
                    routerLink="/admin/products"
                    [queryParams]="{ state: 'unpublished' }"
                    >{{ fill(panelText.workProducts, count) }}</a
                  >
                }
                @if (counts().unpricedProducts; as count) {
                  <a
                    uiActionLink
                    routerLink="/admin/products"
                    [queryParams]="{ missing: 'price' }"
                    >{{ fill(panelText.workUnpricedProducts, count) }}</a
                  >
                }
              </app-panel-row>
              <app-panel-row
                stacked
                [label]="documentText.page.title"
                link="/admin/documents"
              >
                @if (counts().expiredDocuments; as count) {
                  <a
                    uiActionLink
                    routerLink="/admin/documents"
                    [queryParams]="{ status: 'expired' }"
                    >{{ fill(panelText.workDocumentsExpired, count) }}</a
                  >
                }
                @if (counts().expiringDocuments; as count) {
                  <a
                    uiActionLink
                    routerLink="/admin/documents"
                    [queryParams]="{ status: 'expiring' }"
                    >{{ fill(panelText.workDocuments, count) }}</a
                  >
                }
              </app-panel-row>
              <!-- What waits, over when the catalog last moved; no date where
                   no run was ever applied. -->
              <app-panel-row
                stacked
                [label]="syncText.areas.catalog.title"
                link="/admin/sync/catalog"
              >
                @if (counts().stagedCatalogRuns; as count) {
                  <a
                    uiActionLink
                    routerLink="/admin/sync/catalog"
                    [queryParams]="{ status: 'previewed' }"
                    >{{ fill(panelText.workSyncRuns, count) }}</a
                  >
                }
                @if (lastSync().catalog; as moment) {
                  <span class="flex text-xs text-ink-subtle">{{ moment }}</span>
                }
              </app-panel-row>
            </app-panel-card>

            <!-- Straight into the editor: the public page shows a pencil only
                 in edit mode. -->
            <app-panel-card
              key="pages"
              class="order-5 md:order-0"
              [heading]="panelText.pages"
              [glyph]="fileTextIcon"
            >
              @for (slug of pageSlugs; track slug) {
                <app-panel-row
                  [label]="navText[slug]"
                  [link]="['/admin/pages', slug, 'edit']"
                  [queryParams]="editorFrom()"
                />
              }
            </app-panel-card>
          }

          <app-panel-card
            key="security"
            class="order-8 md:order-0"
            [heading]="panelText.securityHeading"
            [glyph]="lockIcon"
          >
            <app-panel-row
              [label]="panelText.changePassword"
              link="/change-password"
            />
          </app-panel-card>
        </div>

        <div class="contents md:flex md:flex-col md:gap-6.5">
          <!-- Two rows, as two permissions: a manager is offered the one they
               have. Only customers wait; staff are created approved. -->
          <app-panel-card
            key="accounts"
            class="order-2 md:order-0"
            [heading]="panelText.accounts"
            [glyph]="usersIcon"
          >
            <app-panel-row
              [label]="userText.customersPage.title"
              link="/admin/users"
            >
              @if (counts().registrations; as count) {
                <a
                  uiActionLink
                  routerLink="/admin/users"
                  [queryParams]="{ status: 'pending' }"
                  >{{ fill(panelText.workRegistrations, count) }}</a
                >
              }
            </app-panel-row>
            @if (isAdmin()) {
              <app-panel-row
                [label]="userText.staffPage.title"
                link="/admin/users/staff"
              />
            }
            <!-- With the accounts it writes: the same work, from elsewhere. -->
            <app-panel-row
              stacked
              [label]="syncText.areas.customers.title"
              link="/admin/sync/customers"
            >
              @if (counts().stagedCustomerRuns; as count) {
                <a
                  uiActionLink
                  routerLink="/admin/sync/customers"
                  [queryParams]="{ status: 'previewed' }"
                  >{{ fill(panelText.workSyncRuns, count) }}</a
                >
              }
              @if (lastSync().customers; as moment) {
                <span class="flex text-xs text-ink-subtle">{{ moment }}</span>
              }
            </app-panel-row>
          </app-panel-card>

          @if (isAdmin()) {
            <app-panel-card
              key="registries"
              class="order-4 md:order-0"
              [heading]="panelText.registries"
              [glyph]="funnelIcon"
            >
              <app-panel-row
                [label]="attributeText.page.title"
                link="/admin/attributes"
              />
              <app-panel-row
                [label]="inventoryText.page.title"
                link="/admin/attributes/inventory"
              />
              <app-panel-row
                [label]="tierText.page.title"
                link="/admin/tiers"
              />
            </app-panel-card>

            <!-- Only while the deployment asks for a consent; older records
                 stay findable at the lookup's URL. -->
            @if (consentPurposes.length > 0) {
              <app-panel-card
                key="consents"
                class="order-6 md:order-0"
                [heading]="consentText.page.title"
                [glyph]="bookCheckIcon"
              >
                <app-panel-row
                  [label]="consentText.panelLookup"
                  link="/admin/consents"
                />
                @for (purpose of consentPurposes; track purpose) {
                  <app-panel-row
                    [label]="consentTextLabel(purpose)"
                    [link]="['/admin/pages', consentSlugs[purpose], 'edit']"
                    [queryParams]="editorFrom()"
                  />
                }
              </app-panel-card>
            }

            <app-panel-card
              key="operations"
              class="order-7 md:order-0"
              [heading]="panelText.operations"
              [glyph]="wrenchIcon"
            >
              <!-- The two states an admin can forget they left on, only while
                   true: the panel opens every admin session. -->
              <app-panel-row
                [label]="operationsText.page.title"
                link="/admin/operations"
              >
                @if (maintenanceOn()) {
                  <span uiStatusBadge tone="danger">
                    {{ panelText.maintenanceOn }}
                  </span>
                }
                @for (label of ownedLabels(); track label) {
                  <span uiStatusBadge tone="info">{{ label }}</span>
                }
              </app-panel-row>
              <app-panel-row
                [label]="apiTokenText.page.title"
                link="/admin/api-tokens"
              />
            </app-panel-card>
          }
        </div>
      </div>

      @if (buildInfo(); as info) {
        <p class="mt-10 text-xs text-ink-subtle" [title]="info.title">
          {{ info.line }}
        </p>
      }
    </div>
  `,
})
export class AdminPanelPage {
  protected readonly bookCheckIcon = bookCheckIcon;
  protected readonly clipboardListIcon = clipboardListIcon;
  protected readonly fileTextIcon = fileTextIcon;
  protected readonly funnelIcon = funnelIcon;
  protected readonly lockIcon = lockIcon;
  protected readonly packageIcon = packageIcon;
  protected readonly usersIcon = usersIcon;
  protected readonly wrenchIcon = wrenchIcon;
  private readonly sync = inject(SyncService);
  private readonly build = inject(BuildInfoService);
  private readonly auth = inject(AuthService);
  protected readonly isAdmin = computed(
    () => this.auth.user()?.role === 'admin',
  );
  protected readonly panelText = inject(ADMIN_TEXT).panel;
  protected readonly title = computed(() =>
    this.isAdmin() ? this.panelText.adminPanel : this.panelText.staffArea,
  );
  protected readonly productText = inject(ADMIN_CATALOG_TEXT).products.list;
  protected readonly categoryText = inject(ADMIN_CATALOG_TEXT).categories.list;
  protected readonly documentText = inject(ADMIN_CATALOG_TEXT).documents.list;
  protected readonly attributeText = inject(ADMIN_CATALOG_TEXT).attributes.list;
  protected readonly inventoryText =
    inject(ADMIN_CATALOG_TEXT).attributes.inventory;
  protected readonly tierText = inject(ADMIN_CATALOG_TEXT).tiers;
  protected readonly apiTokenText = inject(ADMIN_TEXT).apiTokens;
  protected readonly operationsText = inject(ADMIN_TEXT).operations;
  protected readonly userText = inject(ADMIN_ACCOUNTS_TEXT).users.list;
  protected readonly consentText = inject(ADMIN_ACCOUNTS_TEXT).consents;
  protected readonly orderText = inject(ADMIN_ORDERING_TEXT).orders.list;
  protected readonly navText = inject(SHARED_TEXT).nav;
  protected readonly syncText = inject(ADMIN_TEXT).sync;
  /** Only what is published has a route to edit it against. */
  protected readonly pageSlugs = inject(SITE_CONFIG).pages.published;
  private readonly consentAsked = inject(SITE_CONFIG).consent;
  protected readonly consentPurposes = CONSENT_PURPOSES.filter(
    (purpose) => this.consentAsked[purpose],
  );
  protected readonly consentSlugs = CONSENT_PAGE_SLUGS;
  protected consentTextLabel(purpose: ConsentPurpose): string {
    return fillText(this.consentText.panelText, {
      purpose: this.consentText.purposes[purpose],
    });
  }
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;
  private readonly moment = adminMomentFormat(this.locale);
  protected readonly editorFrom = injectEditorReturnParams();

  private readonly ownership = inject(OwnershipService);
  private readonly maintenance = inject(MaintenanceSwitchService);

  /** Null until read, and for a manager, whom the endpoints refuse. */
  protected readonly maintenanceOn = computed(
    () => this.maintenance.enabled() ?? false,
  );

  private readonly ownedText: Record<OwnershipArea, string> = {
    catalog: this.panelText.catalogOwned,
    customers: this.panelText.customersOwned,
    orders: this.panelText.ordersOwned,
  };

  /** One chip for the whole shop, else one per owned area. */
  protected readonly ownedLabels = computed(() => {
    const owned = new Set(this.ownership.confirmed() ?? []);
    if (owned.size === OWNERSHIP_AREAS.length) {
      return [this.panelText.fullyOwned];
    }
    return OWNERSHIP_AREAS.filter((area) => owned.has(area)).map(
      (area) => this.ownedText[area],
    );
  });

  /** Per queue; a zero or absent count draws no note. */
  protected readonly counts = inject(WorkService).counts;

  protected fill(template: string, count: number): string {
    return fillText(template, { count });
  }

  /** A manager is refused the catalog log, so its line stays absent. */
  private lastApplied(area: SyncArea) {
    return resource({
      loader: () => this.sync.listRuns({ area }).catch(() => null),
    });
  }

  private readonly runs = {
    catalog: this.lastApplied('catalog'),
    customers: this.lastApplied('customers'),
    orders: this.lastApplied('orders'),
  };

  /** When each area last moved, without a "Last sync:" the row already says. */
  protected readonly lastSync = computed(() => ({
    catalog: this.when(this.runs.catalog.value()?.lastApplied?.finishedAt),
    customers: this.when(this.runs.customers.value()?.lastApplied?.finishedAt),
    orders: this.when(this.runs.orders.value()?.lastApplied?.finishedAt),
  }));

  private when(finishedAt: string | null | undefined): string | null {
    return finishedAt ? this.moment.format(new Date(finishedAt)) : null;
  }

  // A dev image tag is `sha-<40 hex>`: shortened, whole in the title.
  private shorten(version: string): string {
    const sha = /^sha-([0-9a-f]{40})$/.exec(version);
    return sha ? `sha-${sha[1].slice(0, 7)}` : version;
  }

  protected readonly buildInfo = signal<{
    line: string;
    title: string;
  } | null>(null);

  private async loadBuildInfo(): Promise<void> {
    const info = await this.build.get().catch(() => null);
    if (!info) return;

    const version = info.version
      ? fillText(this.panelText.version, {
          version: this.shorten(info.version),
        })
      : this.panelText.versionUnknown;
    const deployed = info.deployedAt
      ? fillText(this.panelText.deployedAt, {
          date: new Intl.DateTimeFormat(this.locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(info.deployedAt)),
        })
      : null;

    this.buildInfo.set({
      line: deployed ? `${version} — ${deployed}` : version,
      title: info.version ?? '',
    });
  }

  constructor() {
    void this.loadBuildInfo();
    // Not for a manager: the reads are refused, and a failed ownership read
    // tells the editors to lock every field.
    if (this.isAdmin()) {
      void this.ownership.load();
      void this.maintenance.load();
    }

    usePageSeo({ name: () => this.title() });
  }
}
