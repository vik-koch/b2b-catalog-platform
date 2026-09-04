import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthUser, BuildInfo, WorkCounts } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { ADMIN_TEXT } from '../config/admin-text';
import { defaultAppText } from '../config/app-text.fixture';
import { defaultAdminText } from '../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { AdminPanelPage } from './admin-panel-page';
import { BuildInfoService } from './build-info.service';
import { SyncService } from './sync/sync.service';
import { MaintenanceService } from './maintenance/maintenance.service';
import { AuthService } from '../auth/auth.service';
import { adminUser, managerUser } from '../auth/auth-user.fixture';
import { WorkService } from '../work/work.service';
import { workStub } from '../work/work.fixture';

// The committed demo config — its de-DE locale is what formats the deploy date.
const config = defaultDeploymentConfig;

/**
 * Renders the panel with the build endpoint answering `info` (or failing), as
 * `user` (whose role decides how much of the panel exists at all), with `counts`
 * waiting.
 */
async function render(
  info: BuildInfo | 'reject',
  user: AuthUser | null = null,
  counts: WorkCounts = {},
) {
  TestBed.configureTestingModule({
    imports: [AdminPanelPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
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
      // Not under test here, and both would otherwise reach the network.
      { provide: SyncService, useValue: { listRuns: vi.fn(async () => null) } },
      {
        provide: MaintenanceService,
        useValue: { getStatus: vi.fn(async () => ({ enabled: false })) },
      },
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

    // de-DE, so "01.08.2026" — asserted loosely enough to survive ICU's
    // formatting details while still proving the date was localized.
    expect(el.textContent).toContain('Version 1.4.0');
    expect(el.textContent).toMatch(/deployed 01\.08\.2026/);
  });

  it('shortens a dev deployment’s commit-sha version, keeping the full tag', async () => {
    const sha = 'a'.repeat(40);
    const el = await render({ version: `sha-${sha}`, deployedAt: null });

    const line = el.querySelector('p[title]');
    expect(line?.textContent).toContain('Version sha-aaaaaaa');
    // No deploy time, so the line is the version alone — no dangling dash.
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

/**
 * The panel's counts (FR-WORK-03). Each is a link into the very list it counts,
 * narrowed to those rows — a count and its list can then never disagree.
 */
describe('AdminPanelPage work counts', () => {
  const note = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('app-work-note a')).find((link) =>
      link.textContent?.includes(text),
    );

  it('links each waiting queue into the list narrowed to it', async () => {
    const el = await render({ version: null, deployedAt: null }, adminUser, {
      registrations: 2,
      orders: 7,
      unpublishedProducts: 3,
    });

    expect(note(el, '2 awaiting approval')?.getAttribute('href')).toBe(
      '/admin/users?status=pending',
    );
    expect(note(el, '7 awaiting your answer')?.getAttribute('href')).toBe(
      '/admin/orders?status=requested',
    );
    expect(note(el, '3 awaiting publication')?.getAttribute('href')).toBe(
      '/admin/products?state=unpublished',
    );
  });

  it('says nothing about a queue that is empty', async () => {
    const el = await render({ version: null, deployedAt: null }, adminUser, {
      registrations: 0,
      orders: 4,
      unpublishedProducts: 0,
    });

    expect(el.querySelectorAll('app-work-note a')).toHaveLength(1);
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
    expect(el.querySelectorAll('app-work-note a')).toHaveLength(2);
  });
});
