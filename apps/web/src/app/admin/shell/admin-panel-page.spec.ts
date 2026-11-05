import { defaultAdminAccountsText } from '../accounts/accounts-text.fixture';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { defaultSharedText } from '../../platform/config/shared-text.fixture';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WorkCounts } from '@b2b-catalog-platform/shared/core/work';
import { BuildInfo } from '@b2b-catalog-platform/shared/admin/platform';
import { OwnershipArea } from '@b2b-catalog-platform/shared/platform';
import { SyncArea } from '@b2b-catalog-platform/shared/core/exchange';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { ADMIN_TEXT } from '../../platform/config/admin-text';
import { defaultStorefrontText } from '../../platform/config/storefront-text.fixture';
import { defaultAdminText } from '../../platform/config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { defaultDeploymentConfig } from '../../platform/config/deployment-config.fixture';
import { AdminPanelPage } from './admin-panel-page';
import { OwnershipService } from '../platform/ownership/ownership.service';
import { MaintenanceSwitchService } from '../site/maintenance-switch.service';
import { BuildInfoService } from '../platform/build-info.service';
import { SyncService } from '../exchange/sync.service';
import { AuthService } from '../../platform/auth/auth.service';
import { adminUser, managerUser } from '../../platform/auth/auth-user.fixture';
import { WorkService } from '../../core/work/work.service';
import { workStub } from '../../core/work/work.fixture';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import { withSite } from '../../core/site/site-config.fixture';

// The committed demo config, whose de-DE locale formats the deploy date.
const config = defaultDeploymentConfig;

/**
 * Renders the panel with the build endpoint answering `info` (or failing), as
 * `user` (whose role decides how much of the panel exists at all), with `counts`
 * waiting.
 */
/** The switches as the panel's chips read them. */
interface Switches {
  maintenanceEnabled: boolean;
  ownedAreas: OwnershipArea[];
}

/** The last answers the panel's chips read, and the reads themselves. */
const settingsStub = (settings: Switches | null = null) => ({
  ownership: {
    load: vi.fn(async () => settings?.ownedAreas ?? []),
    confirmed: signal(settings?.ownedAreas ?? null).asReadonly(),
  },
  maintenance: {
    load: vi.fn(async () => ({ enabled: !!settings?.maintenanceEnabled })),
    enabled: signal(settings?.maintenanceEnabled ?? null).asReadonly(),
  },
});

/** The two logs the panel reads, answering per area so the two rows can be
 * told apart. */
const syncStub = (lastApplied: Partial<Record<SyncArea, string>> = {}) => ({
  listRuns: vi.fn(async ({ area }: { area: SyncArea }) =>
    lastApplied[area]
      ? { lastApplied: { finishedAt: lastApplied[area] } }
      : null,
  ),
});

async function render(
  info: BuildInfo | 'reject',
  user: AuthUser | null = null,
  counts: WorkCounts = {},
  settings = settingsStub(),
  sync = syncStub(),
  deployment = config,
) {
  TestBed.configureTestingModule({
    imports: [AdminPanelPage],
    providers: [
      provideRouter([]),
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      { provide: DEPLOYMENT_CONFIG, useValue: deployment },
      {
        provide: AuthService,
        useValue: { user: signal(user), resolved: signal(true) },
      },
      { provide: WorkService, useValue: workStub(counts) },
      {
        provide: BuildInfoService,
        useValue: {
          get: vi.fn(() =>
            info === 'reject'
              ? Promise.reject(new Error('403'))
              : Promise.resolve(info),
          ),
        },
      },
      // Not under test here, and would otherwise reach the network.
      { provide: SyncService, useValue: sync },
      { provide: OwnershipService, useValue: settings.ownership },
      { provide: MaintenanceSwitchService, useValue: settings.maintenance },
    ],
  });
  const fixture = TestBed.createComponent(AdminPanelPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AdminPanelPage build info', () => {
  it('shows the deployed version and when it was deployed', async () => {
    const el = await render({
      version: '1.4.0',
      deployedAt: '2026-08-01T10:00:00Z',
    });

    // de-DE, so "01.08.2026", asserted loosely enough to survive ICU's
    // details.
    expect(el.textContent).toContain('Version 1.4.0');
    expect(el.textContent).toMatch(/deployed 01\.08\.2026/);
  });

  it('shortens a dev deployment’s commit-sha version, keeping the full tag', async () => {
    const sha = 'a'.repeat(40);
    const el = await render({ version: `sha-${sha}`, deployedAt: null });

    const line = el.querySelector('p[title]');
    expect(line?.textContent).toContain('Version sha-aaaaaaa');
    // No deploy time: the version alone, no dangling dash.
    expect(line?.textContent?.trim()).toBe('Version sha-aaaaaaa');
    expect(line?.getAttribute('title')).toBe(`sha-${sha}`);
  });

  it('says so when nothing stamped the stack', async () => {
    const el = await render({ version: null, deployedAt: null });

    expect(el.textContent).toContain('Version unknown');
  });

  it('stays silent when the endpoint refuses', async () => {
    // A manager may be denied it; the panel must not break over a footer line.
    const el = await render('reject');

    expect(el.textContent).not.toContain('Version');
  });
});

/** The panel's counts (FR-WORK-03), each linking to the list it counts,
 * narrowed, so they never disagree. */
describe('AdminPanelPage work counts', () => {
  const note = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('a[uiActionLink]')).find((link) =>
      link.textContent?.includes(text),
    );

  it('links each waiting queue into the list narrowed to it', async () => {
    const el = await render({ version: null, deployedAt: null }, adminUser, {
      registrations: 2,
      orders: 7,
      unpaidOrders: 4,
      unpublishedProducts: 3,
      expiredDocuments: 5,
      expiringDocuments: 6,
      stagedCatalogRuns: 2,
      stagedCustomerRuns: 3,
    });

    expect(note(el, '2 awaiting approval')?.getAttribute('href')).toBe(
      '/admin/users?status=pending',
    );
    expect(note(el, '7 awaiting your answer')?.getAttribute('href')).toBe(
      '/admin/orders?status=requested',
    );
    // The money queue is the orders screen too, narrowed by both axes at once:
    // an order finished and not paid for is what neither of them names alone.
    expect(note(el, '4 finished, not paid')?.getAttribute('href')).toBe(
      '/admin/orders?status=completed&payment=unpaid',
    );
    expect(note(el, '3 awaiting publication')?.getAttribute('href')).toBe(
      '/admin/products?state=unpublished',
    );
    // Two figures, not one: an expired certificate is the shop out of
    // compliance today and an expiring one is notice, and each opens the
    // document list on its own filter.
    expect(note(el, '5 expired')?.getAttribute('href')).toBe(
      '/admin/documents?status=expired',
    );
    expect(note(el, '6 expiring soon')?.getAttribute('href')).toBe(
      '/admin/documents?status=expiring',
    );
    // The sync row carries two readings on one axis: what is waiting to be
    // decided, over when the catalog last moved.
    expect(note(el, '2 awaiting review')?.getAttribute('href')).toBe(
      '/admin/sync/catalog?status=previewed',
    );
    // The customer runs are their own queue on their own row, beside the
    // accounts they write rather than under the catalog import (FR-ADM-09).
    expect(note(el, '3 awaiting review')?.getAttribute('href')).toBe(
      '/admin/sync/customers?status=previewed',
    );
  });

  it('says nothing about a queue that is empty', async () => {
    const el = await render({ version: null, deployedAt: null }, adminUser, {
      registrations: 0,
      orders: 4,
      unpublishedProducts: 0,
    });

    expect(el.querySelectorAll('a[uiActionLink]')).toHaveLength(1);
    expect(note(el, '4 awaiting your answer')).toBeDefined();
  });

  it('shows a manager the two queues they can act on', async () => {
    // No `unpublishedProducts` key at all for a manager: the catalog is not
    // theirs, and the card holding that note is not on their panel either.
    const el = await render({ version: null, deployedAt: null }, managerUser, {
      registrations: 1,
      orders: 2,
    });

    expect(note(el, '1 awaiting approval')).toBeDefined();
    expect(note(el, '2 awaiting your answer')).toBeDefined();
    expect(el.querySelectorAll('a[uiActionLink]')).toHaveLength(2);
  });
});

/**
 * The two runtime switches, beside the row that changes them (FR-ADM-04,
 * FR-ADM-10). The panel is the first screen of an admin session, and these are
 * the states an admin can leave on without the shop telling them.
 */
describe('AdminPanelPage sync rows', () => {
  /** Two areas, two logs, two answers: without one, the customer row reads as
   * an area that never moved. */
  it('dates each area from its own log', async () => {
    const el = await render(
      { version: null, deployedAt: null },
      adminUser,
      {},
      settingsStub(),
      syncStub({
        catalog: '2026-08-01T10:00:00Z',
        customers: '2026-09-02T10:00:00Z',
      }),
    );

    expect(el.textContent).toMatch(/01\.08\.2026/);
    expect(el.textContent).toMatch(/02\.09\.2026/);
  });

  it('shows no line for an area that has never run', async () => {
    const el = await render(
      { version: null, deployedAt: null },
      adminUser,
      {},
      settingsStub(),
      syncStub({ catalog: '2026-08-01T10:00:00Z' }),
    );

    // The catalog's date alone: the customer and order rows stay blank.
    expect(el.textContent?.match(/\d{2}\.\d{2}\.\d{4}/g)).toHaveLength(1);
  });
});

describe('AdminPanelPage runtime state', () => {
  const panelText = defaultAdminText.panel;

  const withSettings = (over: Partial<Switches>) =>
    settingsStub({ maintenanceEnabled: false, ownedAreas: [], ...over });

  it('says nothing while the shop is live and owns its own catalog', async () => {
    const el = await render(
      { version: null, deployedAt: null },
      adminUser,
      {},
      withSettings({}),
    );

    expect(el.textContent).not.toContain(panelText.maintenanceOn);
    expect(el.textContent).not.toContain(panelText.catalogOwned);
  });

  it('marks maintenance mode while it is on', async () => {
    const el = await render(
      { version: null, deployedAt: null },
      adminUser,
      {},
      withSettings({ maintenanceEnabled: true }),
    );

    expect(el.textContent).toContain(panelText.maintenanceOn);
  });

  it('marks a catalog an external system owns', async () => {
    const el = await render(
      { version: null, deployedAt: null },
      adminUser,
      {},
      withSettings({ ownedAreas: ['catalog'] }),
    );

    expect(el.textContent).toContain(panelText.catalogOwned);
  });

  it('carries both marks at once', async () => {
    // Side by side or stacked is the row's own choice, tested in
    // `panelRowFloor`.
    const el = await render(
      { version: null, deployedAt: null },
      adminUser,
      {},
      withSettings({ maintenanceEnabled: true, ownedAreas: ['catalog'] }),
    );

    expect(el.textContent).toContain(panelText.maintenanceOn);
    expect(el.textContent).toContain(panelText.catalogOwned);
  });

  it('marks the customer area when it is externally owned', async () => {
    const el = await render(
      { version: null, deployedAt: null },
      adminUser,
      {},
      withSettings({ ownedAreas: ['customers'] }),
    );

    expect(el.textContent).toContain(panelText.customersOwned);
  });

  it('does not ask for the settings as a manager', async () => {
    // Admin-only, and a failed read locks every editor field, so a manager's
    // panel must not provoke one.
    const settings = withSettings({});
    await render(
      { version: null, deployedAt: null },
      managerUser,
      {},
      settings,
    );

    expect(settings.ownership.load).not.toHaveBeenCalled();
    expect(settings.maintenance.load).not.toHaveBeenCalled();
  });

  it('asks for them once as an admin', async () => {
    const settings = withSettings({});
    await render({ version: null, deployedAt: null }, adminUser, {}, settings);

    expect(settings.ownership.load).toHaveBeenCalledTimes(1);
    expect(settings.maintenance.load).toHaveBeenCalledTimes(1);
  });
});

describe('AdminPanelPage consents (NFR-LEGAL-09)', () => {
  const text = defaultAdminAccountsText.consents;
  const asking = (contact: boolean, account: boolean) =>
    withSite({ consent: { contact, account } }, config);
  const renderAs = (user: AuthUser, deployment = asking(true, false)) =>
    render(
      { version: null, deployedAt: null },
      user,
      {},
      settingsStub(),
      syncStub(),
      deployment,
    );
  const section = (el: HTMLElement) =>
    el.querySelector('section:has(#admin-consents-heading)');

  it('gives an admin the lookup and each text the deployment asks for', async () => {
    const el = await renderAs(adminUser);

    const links = [...(section(el)?.querySelectorAll('a') ?? [])].map((a) => [
      a.textContent?.trim(),
      a.getAttribute('href'),
    ]);
    expect(links).toEqual([
      [text.panelLookup, '/admin/consents'],
      [
        text.panelText.replace('{purpose}', text.purposes.contact),
        expect.stringMatching(/^\/admin\/pages\/consent-contact\/edit/),
      ],
    ]);
  });

  it('draws no block where nothing is asked', async () => {
    const el = await renderAs(adminUser, asking(false, false));

    expect(section(el)).toBeNull();
  });

  // The operator's duty, so it is no manager's block at all.
  it('draws no block for a manager', async () => {
    const el = await renderAs(managerUser);

    expect(section(el)).toBeNull();
    expect(el.querySelector('a[href="/admin/consents"]')).toBeNull();
  });
});
