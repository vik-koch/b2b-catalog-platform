import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProductDocument } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { APP_TEXT } from '../../config/app-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { ConfirmService } from '../../ui/confirm.service';
import { DocumentListPage } from './document-list-page';
import { DocumentsService } from './documents.service';

const text = defaultAdminText.documentList;

function document(overrides: Partial<ProductDocument> = {}): ProductDocument {
  return {
    id: 'doc-1',
    title: 'Certificate of analysis',
    file: {
      url: '/documents/aaaaaaaaaaaa.pdf',
      name: 'certificate.pdf',
      contentType: 'application/pdf',
      byteSize: 2048,
    },
    issuedAt: '2026-01-15',
    expiresAt: '2027-01-15',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

async function render(
  options: {
    documents?: ProductDocument[];
    searchTerm?: string;
    remove?: Awaited<ReturnType<DocumentsService['remove']>>;
    confirmed?: boolean;
  } = {},
) {
  const service = {
    list: vi.fn(async () => options.documents ?? [document()]),
    remove: vi.fn(async () => options.remove ?? { ok: true as const }),
  };
  const confirm = { ask: vi.fn(async () => options.confirmed ?? true) };

  TestBed.configureTestingModule({
    imports: [DocumentListPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: DocumentsService, useValue: service },
      { provide: ConfirmService, useValue: confirm },
    ],
  });

  const fixture = TestBed.createComponent(DocumentListPage);
  fixture.componentRef.setInput('searchTerm', options.searchTerm ?? '');
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, service, confirm };
}

/** Two rows that differ in both searchable fields. */
const twoDocuments = [
  document({ id: 'a', title: 'Certificate of analysis' }),
  document({
    id: 'b',
    title: 'Data sheet',
    file: { ...document().file, name: 'sheet.pdf' },
  }),
];

describe('DocumentListPage', () => {
  it('lists a document with its file and expiry', async () => {
    const { el } = await render();

    expect(el.textContent).toContain('Certificate of analysis');
    expect(el.textContent).toContain('certificate.pdf');
    // The file's type and size, formatted where they are shown.
    expect(el.textContent).toContain('PDF');
    expect(el.textContent).toContain('2 kB');
  });

  it('says so when a document never expires', async () => {
    const { el } = await render({
      documents: [document({ expiresAt: null })],
    });
    expect(el.textContent).toContain(text.noExpiry);
  });

  it('narrows the list by title, in the browser', async () => {
    const { el, service } = await render({
      documents: twoDocuments,
      searchTerm: 'data',
    });

    expect(el.textContent).toContain('Data sheet');
    expect(el.textContent).not.toContain('Certificate of analysis');
    // The whole list is fetched once; the search does not go to the server.
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('narrows the list by file name too', async () => {
    const { el } = await render({
      documents: twoDocuments,
      searchTerm: 'sheet.pdf',
    });

    expect(el.textContent).toContain('Data sheet');
    expect(el.textContent).not.toContain('Certificate of analysis');
  });

  it('says the list is empty when there are no documents', async () => {
    const { el } = await render({ documents: [] });
    expect(el.textContent).toContain(text.empty);
  });

  it('says the search matched nothing, which is a different answer', async () => {
    const { el } = await render({ searchTerm: 'nothing matches this' });
    expect(el.textContent).toContain(text.noResults);
  });

  it('deletes a document once it is confirmed', async () => {
    const { el, service, confirm } = await render();

    el.querySelector<HTMLElement>(`[title="${text.delete}"]`)?.click();
    await Promise.resolve();

    expect(confirm.ask).toHaveBeenCalled();
    expect(service.remove).toHaveBeenCalledWith('doc-1');
  });

  it('deletes nothing when the confirmation is declined', async () => {
    const { el, service } = await render({ confirmed: false });

    el.querySelector<HTMLElement>(`[title="${text.delete}"]`)?.click();
    await Promise.resolve();

    expect(service.remove).not.toHaveBeenCalled();
  });
});
