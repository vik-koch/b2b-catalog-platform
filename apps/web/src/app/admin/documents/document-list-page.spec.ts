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
    productCount: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

async function render(
  options: {
    documents?: ProductDocument[];
    searchTerm?: string;
    expiry?: string;
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
  fixture.componentRef.setInput('expiry', options.expiry ?? '');
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  /** What the table's rows say, without the headings that carry the filter. */
  const rows = () => el.querySelector('tbody')?.textContent ?? '';
  return { fixture, el, rows, service, confirm };
}

/** An ISO day `days` from now — the states are relative to today, so the
 * fixtures have to be too. */
function day(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** One document in each expiry state, plus one that never comes due. */
const everyState = [
  document({ id: 'valid', title: 'Still valid', expiresAt: day(200) }),
  document({ id: 'soon', title: 'Running out', expiresAt: day(10) }),
  document({ id: 'gone', title: 'Lapsed', expiresAt: day(-1) }),
  document({ id: 'never', title: 'No date', expiresAt: null }),
];

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

  // Read off the rows, never off the whole page: the filter's own options
  // name every state, so a page-wide search finds the words whatever the rows
  // say.
  it('marks a document that is expiring, and one that has lapsed', async () => {
    const { rows } = await render({ documents: everyState });

    expect(rows()).toContain(text.expiryExpiring);
    expect(rows()).toContain(text.expiryExpired);
  });

  it('says nothing about a document that is simply current', async () => {
    const { rows } = await render({
      documents: [document({ expiresAt: day(200) })],
    });

    expect(rows()).not.toContain(text.expiryExpiring);
    expect(rows()).not.toContain(text.expiryExpired);
  });

  it('narrows the list to one expiry state', async () => {
    const { el } = await render({ documents: everyState, expiry: 'expired' });

    expect(el.textContent).toContain('Lapsed');
    expect(el.textContent).not.toContain('Running out');
    expect(el.textContent).not.toContain('Still valid');
  });

  // What the panel's count links to: both states that are work, and neither
  // of the two that are not.
  it('narrows the list to everything that needs attention', async () => {
    const { el } = await render({ documents: everyState, expiry: 'due' });

    expect(el.textContent).toContain('Lapsed');
    expect(el.textContent).toContain('Running out');
    expect(el.textContent).not.toContain('Still valid');
    expect(el.textContent).not.toContain('No date');
  });

  // A document with no expiry is never work, so it belongs with the current
  // ones rather than in a fourth bucket of its own.
  it('counts a document with no expiry as valid', async () => {
    const { el } = await render({ documents: everyState, expiry: 'valid' });

    expect(el.textContent).toContain('No date');
    expect(el.textContent).toContain('Still valid');
    expect(el.textContent).not.toContain('Lapsed');
  });

  it('ignores an expiry filter the URL invented', async () => {
    const { el } = await render({ documents: everyState, expiry: 'yesterday' });

    expect(el.textContent).toContain('Lapsed');
    expect(el.textContent).toContain('Still valid');
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
