import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CustomerSyncPlan,
  CustomerSyncPreviewResponse,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { DeploymentConfig } from '../../config/deployment-config.type';
import { provideOwnership } from '../settings/settings.fixture';
import { CustomerSyncUploadPage } from './customer-sync-upload-page';
import { SyncService } from './sync.service';

const text = defaultAdminText.sync;

// Only the branding the page title is built from; nothing here reads a price.
const config = {
  branding: { title: 'Test Shop' },
} as unknown as DeploymentConfig;

const emptySummary = {
  rows: 1,
  create: 0,
  update: 0,
  softDelete: 0,
  restore: 0,
  unchanged: 0,
  categoriesCreated: 0,
  categoriesRenamed: 0,
  categoriesEmptied: 0,
  keptManual: 0,
  mailed: 0,
  errors: 0,
  fields: [],
};

function plan(over: Partial<CustomerSyncPlan> = {}): CustomerSyncPlan {
  return {
    summary: { ...emptySummary, ...(over.summary ?? {}) },
    accounts: [],
    rowErrors: [],
    truncated: false,
    ...over,
  };
}

function preview(p: CustomerSyncPlan): CustomerSyncPreviewResponse {
  return {
    run: {
      id: 'run-1',
      status: 'previewed',
      source: 'upload',
      filename: 'customers.csv',
      startedAt: '2026-09-17T10:00:00.000Z',
      finishedAt: null,
      actorEmail: 'admin@example.com',
      tokenName: null,
      area: 'customers',
      stagedReason: null,
      options: { fields: ['email', 'tier', 'company'] },
      summary: p.summary,
      error: null,
      notice: null,
    },
    plan: p,
  };
}

interface Harness {
  previewFn: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
}

async function render(
  previewResult: CustomerSyncPreviewResponse,
  owned: 'customers'[] = [],
) {
  const h: Harness = {
    previewFn: vi.fn().mockResolvedValue({ ok: true, preview: previewResult }),
    commit: vi.fn().mockResolvedValue({
      ok: true,
      result: { run: previewResult.run, applied: previewResult.plan.summary },
    }),
  };

  TestBed.configureTestingModule({
    imports: [CustomerSyncUploadPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      provideOwnership(...owned),
      {
        provide: SyncService,
        useValue: { previewCustomers: h.previewFn, commit: h.commit },
      },
    ],
  });

  const fixture = TestBed.createComponent(CustomerSyncUploadPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, h };
}

/** Drives the file input and the preview button the way an admin would. */
async function runPreview(
  fixture: Awaited<ReturnType<typeof render>>['fixture'],
  el: HTMLElement,
) {
  const input = el.querySelector('input[type=file]') as HTMLInputElement;
  const file = new File(['sourceId\nC-1\n'], 'customers.csv', {
    type: 'text/csv',
  });
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new Event('change'));
  fixture.detectChanges();

  buttonWith(el, defaultAdminText.common.preview).click();
  await fixture.whenStable();
  fixture.detectChanges();
}

function buttonWith(el: HTMLElement, label: string): HTMLButtonElement {
  const button = [...el.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(label),
  );
  if (!button) throw new Error(`no button labelled "${label}"`);
  return button;
}

describe('CustomerSyncUploadPage', () => {
  it('previews a file with the selected intent and writes nothing yet', async () => {
    const { fixture, el, h } = await render(preview(plan()));

    await runPreview(fixture, el);

    // The default preset is the whole customer list, which is what a go-live
    // uploads.
    expect(h.previewFn).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        fields: ['email', 'tier', 'company'],
        createMissing: true,
      }),
    );
    expect(h.commit).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.summaryTitle);
  });

  it('sends the price-list intent when that preset is chosen', async () => {
    const { fixture, el, h } = await render(preview(plan()));

    const tiersRadio = [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(text.customers.mode.tiers))
      ?.querySelector('input') as HTMLInputElement;
    tiersRadio.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    await runPreview(fixture, el);

    // Nobody invited and nobody emailed is the whole point of this preset.
    expect(h.previewFn).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        fields: ['tier'],
        createMissing: false,
        updateExisting: true,
      }),
    );
  });

  it('counts the people a run would email before anything is applied', async () => {
    const { fixture, el } = await render(
      preview(plan({ summary: { ...emptySummary, create: 2, mailed: 2 } })),
    );

    await runPreview(fixture, el);

    expect(el.textContent).toContain(text.customers.count.mailed);
    expect(buttonWith(el, text.apply).disabled).toBe(false);
  });

  it('blocks apply until the confirmation word is typed for a run taking access away', async () => {
    const { fixture, el, h } = await render(
      preview(plan({ summary: { ...emptySummary, softDelete: 3 } })),
    );

    await runPreview(fixture, el);
    expect(el.textContent).toContain(
      text.customers.disableWarning.replace('{count}', '3'),
    );
    expect(buttonWith(el, text.apply).disabled).toBe(true);

    const confirm = el.querySelector('input[type=text]') as HTMLInputElement;
    confirm.value = text.deleteConfirmWord;
    confirm.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const enabled = buttonWith(el, text.apply);
    expect(enabled.disabled).toBe(false);
    enabled.click();
    await fixture.whenStable();
    expect(h.commit).toHaveBeenCalledWith('run-1');
  });

  it('discards a stale preview when the intent changes', async () => {
    const { fixture, el } = await render(
      preview(plan({ summary: { ...emptySummary, update: 2 } })),
    );

    await runPreview(fixture, el);
    expect(el.textContent).toContain(text.summaryTitle);

    const tiersRadio = [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(text.customers.mode.tiers))
      ?.querySelector('input') as HTMLInputElement;
    tiersRadio.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(el.textContent).not.toContain(text.summaryTitle);
  });

  it('reports a rejected file in this deployment’s own words', async () => {
    const { fixture, el, h } = await render(preview(plan()));
    h.previewFn.mockResolvedValue({
      ok: false,
      failure: {
        code: 'missing-required-column',
        message: 'Missing the required "sourceId" column',
        params: { column: 'sourceId' },
      },
    });

    await runPreview(fixture, el);

    expect(el.textContent).toContain('sourceId');
    expect(() => buttonWith(el, text.apply)).toThrow();
  });

  it('offers no form at all while the accounts are externally owned', async () => {
    // FR-ADM-10: the screen says why rather than greying a form whose submit
    // the API would refuse.
    const { el } = await render(preview(plan()), ['customers']);

    expect(el.textContent).toContain(
      text.formatErrors['customers-externally-owned'],
    );
    expect(el.querySelector('input[type=file]')).toBeNull();
  });
});
