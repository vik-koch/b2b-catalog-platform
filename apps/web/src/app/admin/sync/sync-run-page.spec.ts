import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SyncPlan, SyncRun, SyncSummary } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { APP_TEXT } from '../../config/app-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { ConfirmService } from '../../ui/confirm.service';
import { SyncRunPage } from './sync-run-page';
import { SyncService } from './sync.service';

const text = defaultAdminText.sync;

const summary: SyncSummary = {
  rows: 4,
  create: 0,
  update: 4,
  softDelete: 0,
  restore: 0,
  unchanged: 0,
  categoriesCreated: 0,
  categoriesRenamed: 0,
  keptManual: 0,
  errors: 0,
  fields: [],
};

const plan: SyncPlan = {
  summary,
  products: [],
  categories: [],
  emptiedCategories: [],
  keptManual: [],
  rowErrors: [],
  truncated: false,
};

function run(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    id: 'run-1',
    status: 'previewed',
    source: 'api',
    filename: 'catalog-export',
    startedAt: '2026-09-10T08:00:00.000Z',
    finishedAt: null,
    actorEmail: null,
    tokenName: 'Nightly import',
    stagedReason: 'policy',
    options: null,
    summary,
    error: null,
    ...overrides,
  };
}

async function render(
  options: {
    run?: SyncRun;
    plan?: SyncPlan | null;
    confirmed?: boolean;
    commit?: Awaited<ReturnType<SyncService['commit']>>;
    discard?: Awaited<ReturnType<SyncService['discard']>>;
  } = {},
) {
  const shown = options.run ?? run();
  const service = {
    getRun: vi.fn(async () => ({
      run: shown,
      plan: options.plan === undefined ? plan : options.plan,
    })),
    commit: vi.fn(
      async () =>
        options.commit ?? {
          ok: true as const,
          result: { run: shown, applied: summary },
        },
    ),
    discard: vi.fn(
      async () => options.discard ?? { ok: true as const, run: shown },
    ),
  };
  const confirm = { ask: vi.fn(async () => options.confirmed ?? true) };

  TestBed.configureTestingModule({
    imports: [SyncRunPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: SyncService, useValue: service },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const fixture = TestBed.createComponent(SyncRunPage);
  fixture.componentRef.setInput('id', shown.id);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(label),
    );
  const click = async (label: string) => {
    button(label)?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  return { el, service, confirm, button, click, fixture };
}

describe('SyncRunPage', () => {
  /** The whole reason the page exists: a run that arrived on its own and
   * stopped short of applying itself has to be readable, and decidable, by
   * somebody who was not there when it came in. */
  it('offers both decisions on a staged run, and says why it is waiting', async () => {
    const { el, button } = await render();

    expect(el.textContent).toContain(text.stagedReason.policy);
    expect(button(text.apply)).toBeTruthy();
    expect(button(text.discardRun)).toBeTruthy();
  });

  it('distinguishes a run held for review from one whose sender doubted it', async () => {
    const { el } = await render({ run: run({ stagedReason: 'requested' }) });

    expect(el.textContent).toContain(text.stagedReason.requested);
    expect(el.textContent).not.toContain(text.stagedReason.policy);
  });

  /** An applied run is a record: it shows what it did and offers nothing. */
  it('shows a finished run without either decision', async () => {
    const { el, button } = await render({
      run: run({
        status: 'applied',
        stagedReason: null,
        finishedAt: '2026-09-10T08:00:05.000Z',
      }),
    });

    expect(el.textContent).toContain(text.status.applied);
    expect(button(text.apply)).toBeUndefined();
    expect(button(text.discardRun)).toBeUndefined();
  });

  it('renders a reported failure as what the sender said, with no diff', async () => {
    const { el } = await render({
      run: run({
        status: 'failed',
        stagedReason: null,
        summary: null,
        error: 'Session 4 timed out reassembling the export',
      }),
      plan: null,
    });

    expect(el.textContent).toContain(text.failureTitle);
    expect(el.textContent).toContain('Session 4 timed out');
    // Not the "no diff stored" line: this run never had one to lose.
    expect(el.textContent).not.toContain(text.planUnavailable);
  });

  it('says so when a run’s diff is no longer stored', async () => {
    const { el } = await render({
      run: run({
        status: 'superseded',
        finishedAt: '2026-09-10T09:00:00.000Z',
      }),
      plan: null,
    });

    expect(el.textContent).toContain(text.planUnavailable);
  });

  it('asks before discarding, and does nothing if the answer is no', async () => {
    const { click, service } = await render({ confirmed: false });

    await click(text.discardRun);

    expect(service.discard).not.toHaveBeenCalled();
  });

  it('discards once the question is answered', async () => {
    const { click, service } = await render();

    await click(text.discardRun);

    expect(service.discard).toHaveBeenCalledWith('run-1');
  });

  /** A run somebody else has already dealt with: the refusal is shown, and
   * the page re-reads rather than keeping a view that is now wrong. */
  it('reports a refusal to apply and reloads the run', async () => {
    const { click, el, service } = await render({
      commit: { ok: false, code: 'run-superseded' },
    });

    await click(text.apply);

    expect(el.textContent).toContain(text.applyErrors['run-superseded']);
    expect(service.getRun).toHaveBeenCalledTimes(2);
  });
});
