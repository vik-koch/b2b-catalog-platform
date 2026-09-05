import { TestBed } from '@angular/core/testing';
import { PublicDocument } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { ProductDocuments } from './product-documents';

const text = defaultAppText.catalog.documents;

function document(overrides: Partial<PublicDocument> = {}): PublicDocument {
  return {
    title: 'Certificate of analysis',
    url: '/documents/aaaaaaaaaaaa.pdf',
    contentType: 'application/pdf',
    byteSize: 2048,
    ...overrides,
  };
}

async function render(documents: PublicDocument[]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductDocuments],
    providers: [{ provide: APP_TEXT, useValue: defaultAppText }],
  });

  const fixture = TestBed.createComponent(ProductDocuments);
  fixture.componentRef.setInput('documents', documents);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ProductDocuments', () => {
  it('links each document to its file, in a new tab', async () => {
    const el = await render([document()]);
    const link = el.querySelector('a');

    expect(link?.textContent).toContain('Certificate of analysis');
    expect(link?.getAttribute('href')).toBe('/documents/aaaaaaaaaaaa.pdf');
    expect(link?.getAttribute('target')).toBe('_blank');
    // Without it the opened tab can reach back into this one.
    expect(link?.getAttribute('rel')).toBe('noopener');
  });

  // What pressing it costs, said before it is pressed — on a phone that is the
  // difference between a link and a 12 MB download.
  it('says what the file is and what it weighs', async () => {
    const el = await render([document({ byteSize: 2 * 1024 * 1024 })]);

    expect(el.textContent).toContain('PDF');
    expect(el.textContent).toContain('2.0 MB');
  });

  it('names an image by its own format', async () => {
    const el = await render([document({ contentType: 'image/png' })]);
    expect(el.textContent).toContain('PNG');
  });

  // Said once and pointed at, rather than repeated into every link's name.
  it('carries the new-tab hint every link is described by', async () => {
    const el = await render([document(), document({ url: '/documents/b.pdf' })]);
    const hint = el.querySelector('a')?.getAttribute('aria-describedby');

    expect(el.querySelector(`#${hint}`)?.textContent).toContain(text.hint);
    expect(el.querySelectorAll('a')).toHaveLength(2);
  });
});
