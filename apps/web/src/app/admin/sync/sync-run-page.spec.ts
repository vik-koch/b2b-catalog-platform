import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CustomerSyncPlan,
  CatalogSyncPlan,
  SyncRun,
  SyncSummary,
} from '@b2b-catalog-platform/shared';
import { signal } from '@angular/core';
import { AuthUser, SyncArea } from '@b2b-catalog-platform/shared';
import { AuthService } from '../../auth/auth.service';
import { adminUser, managerUser } from '../../auth/auth-user.fixture';
import { provideOwnership } from '../settings/settings.fixture';
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
const ownershipText = defaultAdminText.ownership;

const summary: SyncSummary = {
  rows: 4,
  create: 0,
  update: 4,
  softDelete: 0,
  restore: 0,
  unchanged: 0,
  categoriesCreated: 0,
  categoriesRenamed: 0,
  categoriesEmptied: 0,
  keptManual: 0,
  claimed: 0,
  mailed: 0,
  errors: 0,
  fields: [],
};

const plan: CatalogSyncPlan = {
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
    area: 'catalog',
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
    notice: null,
    ...overrides,
  };
}

async function render(
  options: {
    run?: SyncRun;
    plan?: CatalogSyncPlan | CustomerSyncPlan | null;
    confirmed?: boolean;
    commit?: Awaited<ReturnType<SyncService['commit']>>;
    discard?: Awaited<ReturnType<SyncService['discard']>>;
    user?: AuthUser | null;
    owned?: SyncArea[];
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
      {
        provide: AuthService,
        useValue: { user: signal(options.user ?? null) },
      },
      provideOwnership(...(options.owned ?? [])),
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
        area: 'catalog',
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
        area: 'catalog',
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

  /** A note is not a verdict: it rides along a run that went through, and
   * says nothing about whether anyone still has to act. */
  it('shows a note the sender attached to a run that applied itself', async () => {
    const { el } = await render({
      run: run({
        status: 'applied',
        area: 'catalog',
        stagedReason: null,
        finishedAt: '2026-09-10T08:00:05.000Z',
        notice: 'Prices for 12 articles were missing and were left as they are',
      }),
    });

    expect(el.textContent).toContain(text.noticeTitle);
    expect(el.textContent).toContain('12 articles');
    expect(el.textContent).not.toContain(text.failureTitle);
  });

  it('shows no note section on a run that came without one', async () => {
    const { el } = await render();

    expect(el.textContent).not.toContain(text.noticeTitle);
  });

  /** The counts that are an answer at zero stay; the ones that are only
   * noise at zero — a deployment whose feed never restores or renames —
   * appear the run they finally happen. */
  it('keeps the four standing counts and drops the zeroed rest', async () => {
    const { el } = await render();

    for (const label of [
      text.count.create,
      text.count.update,
      text.count.softDelete,
      text.count.errors,
    ]) {
      expect(el.textContent).toContain(label);
    }
    for (const label of [
      text.count.restore,
      text.count.kept,
      text.count.unchanged,
      text.count.renamedCategories,
    ]) {
      expect(el.textContent).not.toContain(label);
    }
  });

  it('shows a count that happened, however quiet the rest of the run', async () => {
    const { el } = await render({
      run: run({ summary: { ...summary, keptManual: 2 } }),
      plan: { ...plan, summary: { ...summary, keptManual: 2 } },
    });

    expect(el.textContent).toContain(text.count.kept);
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

  /**
   * One page, two areas (ADR 0060). Which diff a run holds is read off the
   * plan itself, so a link to a customer run opens on accounts rather than on
   * an empty catalog panel.
   */
  it('renders a customer run with the customer plan', async () => {
    const customerPlan: CustomerSyncPlan = {
      summary: { ...summary, update: 0, create: 1, rows: 1 },
      accounts: [
        {
          kind: 'invite',
          sourceId: 'C-1',
          email: 'ada@example.com',
          id: null,
          changes: [],
          mailed: true,
        },
      ],
      rowErrors: [],
      truncated: false,
    };

    const { el } = await render({
      run: run({ area: 'customers' }),
      plan: customerPlan,
    });

    expect(el.textContent).toContain(text.customers.accountsTitle);
    expect(el.textContent).toContain('ada@example.com');
    expect(el.textContent).toContain(text.customers.kind.invite);
    // The catalog panel's own headings stay away from it.
    expect(el.textContent).not.toContain(text.productsTitle);
  });
});

describe('SyncRunPage while an area is externally owned', () => {
  /** The point of staging: a run the connected system sent exceeded the policy
   * and waits for a person, who answers it here. Ownership is what lets that
   * run exist, so it must not also be what hides its button. */
  it('still applies a staged machine run', async () => {
    const { button, el } = await render({
      run: run({ source: 'api' }),
      user: adminUser,
      owned: ['catalog'],
    });

    expect(button(text.apply)).toBeTruthy();
    expect(el.textContent).not.toContain(ownershipText.runStranded);
  });

  /** An upload staged before the handover, opened after it: the API judges the
   * apply by the setting in force now, so the button would only earn a refusal. */
  it('drops apply on an uploaded run stranded by the handover, and says why', async () => {
    const { button, el } = await render({
      run: run({ source: 'upload', actorEmail: 'admin@example.com' }),
      user: adminUser,
      owned: ['catalog'],
    });

    expect(button(text.apply)).toBeFalsy();
    expect(el.textContent).toContain(ownershipText.runStranded);
    // Somebody has to be able to clear it, and discarding writes nothing to
    // the area — the admin used to lose this button with the other one.
    expect(button(text.discardRun)).toBeTruthy();
  });

  it('keeps apply on an uploaded run while the area is still ours', async () => {
    const { button } = await render({
      run: run({ source: 'upload' }),
      user: adminUser,
    });

    expect(button(text.apply)).toBeTruthy();
  });

  /** A manager cannot read the setting, and a failed read means "everything is
   * owned" — so they keep the button and meet the API's refusal instead. */
  it('leaves a manager’s button alone', async () => {
    const { button } = await render({
      run: run({ area: 'customers', source: 'upload' }),
      user: managerUser,
      owned: ['customers'],
    });

    expect(button(text.apply)).toBeTruthy();
  });
});
