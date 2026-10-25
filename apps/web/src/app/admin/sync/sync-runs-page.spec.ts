import { COMMON_TEXT } from '../../shared/config/common-text';
import { defaultCommonText } from '../../shared/config/common-text.fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  fillText,
  SyncArea,
  SyncRun,
  SyncSummary,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { defaultAdminText } from '../../shared/config/admin-text.fixture';
import { APP_TEXT } from '../../shared/config/app-text';
import { defaultAppText } from '../../shared/config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { defaultDeploymentConfig } from '../../shared/config/deployment-config.fixture';
import { SyncRunsPage } from './sync-runs-page';
import { SyncService } from './sync.service';

const text = defaultAdminText.sync;

const summary: SyncSummary = {
  rows: 12,
  create: 1,
  update: 9,
  softDelete: 0,
  restore: 0,
  unchanged: 2,
  categoriesCreated: 0,
  categoriesRenamed: 0,
  categoriesEmptied: 0,
  keptManual: 0,
  claimed: 0,
  claimedById: 0,
  mailed: 0,
  errors: 0,
  fields: [],
};

function run(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    id: 'run-1',
    status: 'applied',
    source: 'upload',
    filename: 'catalog.csv',
    startedAt: '2026-09-10T08:00:00.000Z',
    finishedAt: '2026-09-10T08:00:04.000Z',
    actorEmail: 'admin@example.com',
    tokenName: null,
    area: 'catalog',
    stagedReason: null,
    options: null,
    summary,
    error: null,
    notice: null,
    ...overrides,
  };
}

async function render(
  runs: SyncRun[] = [run()],
  status = '',
  area: SyncArea = 'catalog',
) {
  const service = {
    listRuns: vi.fn(async () => ({
      runs,
      pagination: {
        page: 1,
        pageSize: 20,
        total: runs.length,
        totalPages: 1,
      },
      lastApplied: runs[0] ?? null,
    })),
  };

  TestBed.configureTestingModule({
    imports: [SyncRunsPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: COMMON_TEXT, useValue: defaultCommonText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: SyncService, useValue: service },
    ],
  });
  const fixture = TestBed.createComponent(SyncRunsPage);
  fixture.componentRef.setInput('area', area);
  fixture.componentRef.setInput('status', status);
  await fixture.whenStable();
  fixture.detectChanges();

  return { el: fixture.nativeElement as HTMLElement, service, fixture };
}

describe('SyncRunsPage', () => {
  it('says so when nothing has ever run', async () => {
    const { el } = await render([]);

    expect(el.textContent).toContain(text.historyEmpty);
  });

  /** The column that answers "who did this" for a run nobody was present for:
   * a machine run has no person behind it, only the credential it used. */
  it('names the token behind a machine run, and the admin behind an upload', async () => {
    const { el } = await render([
      run({ id: 'a', source: 'upload' }),
      run({
        id: 'b',
        source: 'api',
        actorEmail: null,
        tokenName: 'Nightly import',
      }),
    ]);

    expect(el.textContent).toContain('admin@example.com');
    expect(el.textContent).toContain('Nightly import');
  });

  it('shows a staged run as waiting, with the reason it is waiting', async () => {
    const { el } = await render([
      run({
        status: 'previewed',
        stagedReason: 'policy',
        finishedAt: null,
        source: 'api',
        tokenName: 'Nightly import',
      }),
    ]);

    expect(el.textContent).toContain(text.status.previewed);
    expect(el.querySelector(`[title="${text.stagedReason.policy}"]`)).not.toBe(
      null,
    );
  });

  /** A run that broke before it produced anything has no counts to show, and
   * the page must not fall over reading them. */
  it('lists a reported failure without a summary', async () => {
    const { el } = await render([
      run({
        status: 'failed',
        source: 'api',
        actorEmail: null,
        tokenName: 'Nightly import',
        summary: null,
        options: null,
        error: 'Could not read the export',
      }),
    ]);

    expect(el.textContent).toContain(text.status.failed);
  });

  /** The counts say how much; this says what — which for a feed that runs
   * every twenty minutes is the question actually being asked of the log. */
  it('names the fields a run rewrote, and counts the ones it has no room for', async () => {
    const { el } = await render([
      run({
        summary: {
          ...summary,
          fields: ['name', 'stock', 'price:default', 'price:wholesale'],
        },
      }),
    ]);

    expect(el.textContent).toContain(text.field.name);
    expect(el.textContent).toContain(text.field.stock);
    // Every price column names its own list now — the storefront's included.
    expect(el.textContent).toContain(
      fillText(text.field.priceList, { key: 'default' }),
    );
    // The fourth is over the limit the column shows, so it is counted instead.
    expect(el.textContent).not.toContain(
      fillText(text.field.priceList, { key: 'wholesale' }),
    );
    expect(el.textContent).toContain(fillText(text.moreFields, { count: 1 }));
  });

  /** Each area's runs write their own fields, and its log names them in its
   * own words rather than as the keys the summary stores. */
  it("names a customer run's fields in the customer area's words", async () => {
    const { el } = await render(
      [
        run({
          area: 'customers',
          summary: { ...summary, fields: ['tier', 'companyName'] },
        }),
      ],
      '',
      'customers',
    );

    expect(el.textContent).toContain(text.customers.field.tier);
    expect(el.textContent).toContain(text.customers.field.companyName);
  });

  it("names an order run's fields in the order area's words", async () => {
    const { el } = await render(
      [
        run({
          area: 'orders',
          summary: { ...summary, fields: ['status', 'lines'] },
        }),
      ],
      '',
      'orders',
    );

    expect(el.textContent).toContain(text.orders.field.status);
    expect(el.textContent).toContain(text.orders.field.lines);
  });

  /** A run the source and the catalog agree about is over on arrival: it is
   * recorded, and it is not work. */
  it('shows a no-change run as such', async () => {
    const { el } = await render([
      run({
        status: 'no-change',
        summary: { ...summary, create: 0, update: 0 },
      }),
    ]);

    expect(el.textContent).toContain(text.status['no-change']);
  });

  it('asks the API for the status the URL names', async () => {
    const { service } = await render([run()], 'previewed');

    expect(service.listRuns).toHaveBeenCalledWith({
      area: 'catalog',
      page: 1,
      status: 'previewed',
    });
  });

  /** A hand-edited status is not a status: the list falls back to everything
   * rather than asking the API about a word it does not know. */
  it('ignores a status the contract does not have', async () => {
    const { service } = await render([run()], 'nonsense');

    expect(service.listRuns).toHaveBeenCalledWith({
      area: 'catalog',
      page: 1,
      status: undefined,
    });
  });

  /** One component, two logs: the area decides the heading it wears and the
   * log it asks for, and nothing else about the screen changes. */
  it('reads the customer log when that is the area it is on', async () => {
    const { el, service } = await render([run()], '', 'customers');

    expect(service.listRuns).toHaveBeenCalledWith({
      area: 'customers',
      page: 1,
      status: undefined,
    });
    expect(el.textContent).toContain(text.areas.customers.title);
  });

  /** The manual upload is the catalog's alone until the customer import
   * ships, so the customer log offers no way to start one. */
  it('offers no upload on the customer log', async () => {
    const { el } = await render([run()], '', 'customers');

    expect(el.querySelector('a[href="/admin/sync/catalog/new"]')).toBeNull();
  });
});
