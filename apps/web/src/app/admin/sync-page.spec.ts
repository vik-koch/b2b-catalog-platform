import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SyncPlan, SyncPreviewResponse } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { ADMIN_TEXT } from '../config/admin-text';
import { defaultAppText } from '../config/app-text.fixture';
import { defaultAdminText } from '../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { SyncPage } from './sync-page';
import { SyncService } from './sync.service';

const text = defaultAdminText.sync;

const config = {
  branding: { title: 'Test Shop' },
  catalog: { currency: { code: 'EUR', locale: 'de-DE' } },
} as unknown as DeploymentConfig;

const emptySummary = {
  rows: 1,
  create: 0,
  update: 0,
  softDelete: 0,
  restore: 0,
  unchanged: 0,
  categoriesCreated: 0,
  keptManual: 0,
  errors: 0,
};

function plan(over: Partial<SyncPlan> = {}): SyncPlan {
  return {
    summary: { ...emptySummary, ...(over.summary ?? {}) },
    products: [],
    categories: [],
    emptiedCategories: [],
    keptManual: [],
    rowErrors: [],
    truncated: false,
    ...over,
  };
}

function preview(p: SyncPlan): SyncPreviewResponse {
  return {
    run: {
      id: 'run-1',
      status: 'previewed',
      source: 'upload',
      filename: 'catalog.csv',
      startedAt: '2026-07-30T10:00:00.000Z',
      finishedAt: null,
      actorEmail: 'admin@example.com',
      options: presetOptions,
      summary: p.summary,
      error: null,
    },
    plan: p,
  };
}

const presetOptions = {
  fields: ['name', 'category'] as ('name' | 'category')[],
  createMissing: true,
  updateExisting: true,
  restoreReturning: true,
  createCategories: true,
  productSetAuthoritative: true,
  softDeleteMissingProducts: false,
};

interface Harness {
  previewFn: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
}

async function render(previewResult: SyncPreviewResponse) {
  const h: Harness = {
    previewFn: vi.fn().mockResolvedValue({ ok: true, preview: previewResult }),
    commit: vi.fn().mockResolvedValue({
      ok: true,
      result: { run: previewResult.run, applied: previewResult.plan.summary },
    }),
  };

  TestBed.configureTestingModule({
    imports: [SyncPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      {
        provide: SyncService,
        useValue: {
          preview: h.previewFn,
          commit: h.commit,
          listRuns: () =>
            Promise.resolve({ runs: [], total: 0, lastApplied: null }),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(SyncPage);
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
  const file = new File(['sourceId\nA-1\n'], 'catalog.csv', {
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

describe('SyncPage', () => {
  it('previews a file with the selected intent and writes nothing yet', async () => {
    const { fixture, el, h } = await render(preview(plan()));

    await runPreview(fixture, el);

    // The default preset is the complete export.
    expect(h.previewFn).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        productSetAuthoritative: true,
        softDeleteMissingProducts: false,
      }),
    );
    expect(h.commit).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.summaryTitle);
  });

  it('names the chosen file in the drop zone', async () => {
    const { fixture, el } = await render(preview(plan()));

    expect(el.textContent).toContain(text.dropHint);

    const input = el.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['sourceId\n'], 'export-2026-07.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(el.textContent).toContain('export-2026-07.csv');
    expect(el.textContent).toContain(text.changeFile);
  });

  it('sends the price-update intent when that preset is chosen', async () => {
    const { fixture, el, h } = await render(preview(plan()));

    const priceRadio = [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(text.mode.prices))
      ?.querySelector('input') as HTMLInputElement;
    priceRadio.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    await runPreview(fixture, el);

    expect(h.previewFn).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        fields: [],
        createMissing: false,
        productSetAuthoritative: false,
      }),
    );
  });

  it('offers no apply button for a file that changes nothing', async () => {
    const { fixture, el } = await render(preview(plan()));

    await runPreview(fixture, el);

    expect(el.textContent).toContain(text.nothingToApply);
    expect(() => buttonWith(el, text.apply)).toThrow();
  });

  it('blocks apply until the confirmation word is typed for a run that hides products', async () => {
    const { fixture, el, h } = await render(
      preview(plan({ summary: { ...emptySummary, softDelete: 3 } })),
    );

    await runPreview(fixture, el);
    expect(el.textContent).toContain(
      text.deleteWarning.replace('{count}', '3'),
    );

    const apply = buttonWith(el, text.apply);
    expect(apply.disabled).toBe(true);

    const confirm = el.querySelector('input[type=text]') as HTMLInputElement;
    confirm.value = 'nope';
    confirm.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(buttonWith(el, text.apply).disabled).toBe(true);

    confirm.value = text.deleteConfirmWord;
    confirm.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const enabled = buttonWith(el, text.apply);
    expect(enabled.disabled).toBe(false);
    enabled.click();
    await fixture.whenStable();
    expect(h.commit).toHaveBeenCalledWith('run-1');
  });

  it('applies a harmless run without any confirmation', async () => {
    const { fixture, el, h } = await render(
      preview(plan({ summary: { ...emptySummary, update: 2 } })),
    );

    await runPreview(fixture, el);
    buttonWith(el, text.apply).click();
    await fixture.whenStable();

    expect(h.commit).toHaveBeenCalledWith('run-1');
  });

  it('discards a stale preview when the intent changes', async () => {
    const { fixture, el } = await render(
      preview(plan({ summary: { ...emptySummary, update: 2 } })),
    );

    await runPreview(fixture, el);
    expect(el.textContent).toContain(text.summaryTitle);

    const priceRadio = [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(text.mode.prices))
      ?.querySelector('input') as HTMLInputElement;
    priceRadio.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // The diff described the old intent, so it can no longer be applied.
    expect(el.textContent).not.toContain(text.summaryTitle);
  });

  it('formats a price change with the deployment currency and leaves text alone', async () => {
    const { fixture, el } = await render(
      preview(
        plan({
          summary: { ...emptySummary, update: 1 },
          products: [
            {
              kind: 'update',
              sourceId: 'A-1',
              name: 'Espresso Blend',
              slug: 'espresso-blend',
              changes: [
                { field: 'price:default', from: 1890, to: 1990 },
                { field: 'name', from: 'Old', to: 'Espresso Blend' },
              ],
            },
          ],
        }),
      ),
    );

    await runPreview(fixture, el);

    const body = el.textContent ?? '';
    expect(body).toContain('18,90');
    expect(body).toContain('19,90');
    expect(body).toContain('Old');
  });

  it('reports a rejected file without offering anything to apply', async () => {
    const { fixture, el, h } = await render(preview(plan()));
    h.previewFn.mockResolvedValue({
      ok: false,
      message: 'Missing the required "sourceId" column',
    });

    await runPreview(fixture, el);

    expect(el.textContent).toContain(text.previewError);
    expect(el.textContent).toContain('sourceId');
    expect(() => buttonWith(el, text.apply)).toThrow();
  });
});
