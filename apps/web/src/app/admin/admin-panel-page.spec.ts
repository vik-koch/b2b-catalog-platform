import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BuildInfo } from '@b2b-catalog-platform/shared';
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

// The committed demo config — its de-DE locale is what formats the deploy date.
const config = defaultDeploymentConfig;

/** Renders the panel with the build endpoint answering `info` (or failing). */
async function render(info: BuildInfo | 'reject') {
  TestBed.configureTestingModule({
    imports: [AdminPanelPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
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
