import { TestBed } from '@angular/core/testing';
import { PublicDocument } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { ProductDocuments } from './product-documents';

const text = defaultAppText.catalog.documents;

function file(
  overrides: Partial<NonNullable<PublicDocument['file']>> = {},
): NonNullable<PublicDocument['file']> {
  return {
    url: '/documents/aaaaaaaaaaaa.pdf',
    contentType: 'application/pdf',
    byteSize: 2048,
    ...overrides,
  };
}

function document(overrides: Partial<PublicDocument> = {}): PublicDocument {
  return {
    title: 'Certificate of analysis',
    file: file(),
    link: null,
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
    const el = await render([
      document({ file: file({ byteSize: 2 * 1024 * 1024 }) }),
    ]);

    expect(el.textContent).toContain('PDF');
    expect(el.textContent).toContain('2.0 MB');
  });

  it('names an image by its own format', async () => {
    const el = await render([
      document({ file: file({ contentType: 'image/png' }) }),
    ]);
    expect(el.textContent).toContain('PNG');
  });

  // Said once and pointed at, rather than repeated into every link's name.
  it('carries the new-tab hint every link is described by', async () => {
    const el = await render([
      document(),
      document({ file: file({ url: '/documents/b.pdf' }) }),
    ]);
    const hint = el.querySelector('a')?.getAttribute('aria-describedby');

    expect(el.querySelector(`#${hint}`)?.textContent).toContain(text.hint);
    expect(el.querySelectorAll('a')).toHaveLength(2);
  });

  describe('a link (FR-DOC-05)', () => {
    const link = 'https://www.example.org/register/0001';

    // The entry is the document: the row leads there, and says where.
    it('makes a link-only row the link, named by its site', async () => {
      const el = await render([document({ file: null, link })]);
      const anchors = el.querySelectorAll('a');

      expect(anchors).toHaveLength(1);
      expect(anchors[0].getAttribute('href')).toBe(link);
      expect(anchors[0].getAttribute('target')).toBe('_blank');
      expect(anchors[0].textContent).toContain('Certificate of analysis');
      expect(anchors[0].textContent).toContain('example.org');
      expect(anchors[0].textContent).not.toContain('PDF');
    });

    // Two places to go, so two anchors: never one inside the other.
    it('offers a file and its link as two links on one row', async () => {
      const el = await render([document({ link })]);
      const [title, entry] = Array.from(el.querySelectorAll('a'));

      expect(el.querySelectorAll('li')).toHaveLength(1);
      expect(title.getAttribute('href')).toBe('/documents/aaaaaaaaaaaa.pdf');
      expect(title.querySelector('a')).toBeNull();
      expect(entry.getAttribute('href')).toBe(link);
      expect(entry.getAttribute('target')).toBe('_blank');
      expect(entry.textContent?.trim()).toBe('example.org');
      // The visible site is part of the accessible name, not replaced by it.
      expect(entry.getAttribute('aria-label')).toContain('example.org');
      expect(el.textContent).toContain('PDF');
    });
  });
});
