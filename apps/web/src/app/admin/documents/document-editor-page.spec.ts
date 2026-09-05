import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ProductDocument } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { APP_TEXT } from '../../config/app-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { DocumentEditorPage } from './document-editor-page';
import { DocumentsService } from './documents.service';

const text = defaultAdminText.documentEditor;

const storedFile = {
  url: '/documents/aaaaaaaaaaaa.pdf',
  name: 'certificate.pdf',
  contentType: 'application/pdf' as const,
  byteSize: 2048,
};

function document(overrides: Partial<ProductDocument> = {}): ProductDocument {
  return {
    id: 'doc-1',
    title: 'Certificate of analysis',
    file: storedFile,
    issuedAt: '2026-01-15',
    expiresAt: '2027-01-15',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

async function render(
  options: {
    id?: string | null;
    existing?: ProductDocument | undefined;
    upload?: ProductDocument['file'] | Error;
    create?: Awaited<ReturnType<DocumentsService['create']>>;
    update?: Awaited<ReturnType<DocumentsService['update']>>;
  } = {},
) {
  const service = {
    get: vi.fn(async () => options.existing),
    uploadFile: vi.fn(async () => {
      if (options.upload instanceof Error) throw options.upload;
      return options.upload ?? storedFile;
    }),
    create: vi.fn(
      async () => options.create ?? { ok: true as const, document: document() },
    ),
    update: vi.fn(
      async () => options.update ?? { ok: true as const, document: document() },
    ),
  };

  TestBed.configureTestingModule({
    imports: [DocumentEditorPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: DocumentsService, useValue: service },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(
              options.id === undefined ? {} : { id: options.id ?? '' },
            ),
            queryParamMap: convertToParamMap({}),
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(DocumentEditorPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const type = async (label: string, value: string) => {
    const field = [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(label))
      ?.querySelector('input');
    if (!field) throw new Error(`no field for ${label}`);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await settle();
  };
  const choose = async (file: File) => {
    const input = el.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('no file input');
    Object.defineProperty(input, 'files', { value: [file], writable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  const save = async () => {
    const button = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(defaultAdminText.common.save),
    );
    button?.click();
    await settle();
  };
  const error = () => el.querySelector('[role="alert"]')?.textContent?.trim();

  return { fixture, el, service, type, choose, save, error, settle };
}

const pdf = () =>
  new File([new Uint8Array([1, 2, 3])], 'certificate.pdf', {
    type: 'application/pdf',
  });

describe('DocumentEditorPage', () => {
  it('uploads the file as soon as it is chosen, before any save', async () => {
    const { service, choose, el } = await render();

    await choose(pdf());

    expect(service.uploadFile).toHaveBeenCalledTimes(1);
    expect(service.create).not.toHaveBeenCalled();
    // What is stored is shown by its own name, since the stored one is a hash.
    expect(el.textContent).toContain('certificate.pdf');
  });

  it('saves the title, the uploaded file and both dates as one record', async () => {
    const { service, type, choose, save } = await render();

    await type(text.title, 'Certificate of analysis');
    await choose(pdf());
    await type(text.issuedAt, '2026-01-15');
    await type(text.expiresAt, '2027-01-15');
    await save();

    expect(service.create).toHaveBeenCalledWith({
      title: 'Certificate of analysis',
      file: storedFile,
      issuedAt: '2026-01-15',
      expiresAt: '2027-01-15',
    });
  });

  it('refuses to save an untitled document', async () => {
    const { service, choose, save, error } = await render();

    await choose(pdf());
    await save();

    expect(error()).toBe(text.titleRequired);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('refuses to save a document with no file', async () => {
    const { service, type, save, error } = await render();

    await type(text.title, 'Titled but fileless');
    await save();

    expect(error()).toBe(text.fileRequired);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('answers a backwards pair of dates without asking the server', async () => {
    const { service, type, choose, save, error } = await render();

    await type(text.title, 'Backwards');
    await choose(pdf());
    await type(text.issuedAt, '2026-05-01');
    await type(text.expiresAt, '2026-04-01');
    await save();

    expect(error()).toBe(text.expiryBeforeIssue);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('reports an upload that failed and keeps the form empty of a file', async () => {
    const { choose, save, service, type, error } = await render({
      upload: new Error('network'),
    });

    await choose(pdf());
    expect(error()).toBe(text.uploadError);

    await type(text.title, 'Anything');
    await save();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('replaces the file on an existing document, keeping its identity', async () => {
    const replacement = { ...storedFile, url: '/documents/bbbbbbbbbbbb.pdf' };
    const { service, choose, save } = await render({
      id: 'doc-1',
      existing: document(),
      upload: replacement,
    });

    await choose(pdf());
    await save();

    expect(service.update).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({
        title: 'Certificate of analysis',
        file: replacement,
      }),
    );
  });

  it('says so when the document is gone', async () => {
    const { el } = await render({ id: 'doc-1', existing: undefined });
    expect(el.textContent).toContain(text.notFound);
  });
});
