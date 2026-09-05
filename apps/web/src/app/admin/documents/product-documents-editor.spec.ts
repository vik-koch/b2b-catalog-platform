import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LinkedDocument, ProductDocument } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { DocumentsService } from './documents.service';
import { ProductDocumentsEditor } from './product-documents-editor';

const text = defaultAdminText.productEditor.documents;

const linked = (
  overrides: Partial<LinkedDocument> & { id: string; title: string },
): LinkedDocument => ({ expiresAt: null, ...overrides });

const inList = (document: LinkedDocument): ProductDocument => ({
  ...document,
  file: {
    url: '/documents/aaaaaaaaaaaa.pdf',
    name: 'certificate.pdf',
    contentType: 'application/pdf',
    byteSize: 2048,
  },
  issuedAt: null,
  productCount: 1,
  updatedAt: '2026-08-01T00:00:00.000Z',
});

const CERTIFICATE = linked({
  id: 'doc-1',
  title: 'Certificate of analysis',
  expiresAt: '2027-01-15',
});
const SHEET = linked({ id: 'doc-2', title: 'Data sheet' });

async function render(value: LinkedDocument[] = []) {
  const list = vi.fn(async () => [inList(CERTIFICATE), inList(SHEET)]);

  TestBed.configureTestingModule({
    imports: [ProductDocumentsEditor],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: DocumentsService, useValue: { list } },
    ],
  });

  const fixture = TestBed.createComponent(ProductDocumentsEditor);
  fixture.componentRef.setInput('value', value);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const emitted: LinkedDocument[][] = [];
  fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  /** Opens the panel unless it opened itself (it does when there are rows). */
  const open = async () => {
    if (el.querySelector('[role="combobox"]')) return;
    el.querySelector('button')?.dispatchEvent(new Event('click'));
    await settle();
  };
  const type = async (value: string) => {
    const input = el.querySelector<HTMLInputElement>('input[role="combobox"]');
    if (!input) throw new Error('the search field is not on screen');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
  };
  const options = () =>
    [...el.querySelectorAll('[role="option"]')].map((o) =>
      o.textContent?.trim(),
    );

  return { fixture, el, emitted, open, type, options, settle };
}

describe('ProductDocumentsEditor (FR-DOC-02)', () => {
  it('starts closed when the product carries no document', async () => {
    const { el } = await render();
    expect(el.querySelector('[role="combobox"]')).toBeNull();
  });

  it('opens itself where there is something to see', async () => {
    const { el } = await render([CERTIFICATE]);
    expect(el.textContent).toContain('Certificate of analysis');
    expect(el.querySelector('[role="combobox"]')).not.toBeNull();
  });

  it('adds a document the search suggested', async () => {
    const { open, type, el, emitted } = await render();

    await open();
    await type('data');
    el.querySelector('[role="option"]')?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );

    expect(emitted.at(-1)).toEqual([SHEET]);
  });

  it('does not offer a document the product already carries', async () => {
    const { open, type, options } = await render([CERTIFICATE]);

    await open();
    await type('c');

    expect(options().join(' ')).not.toContain('Certificate of analysis');
  });

  it('takes one document off the product, leaving the rest', async () => {
    const { el, emitted } = await render([CERTIFICATE, SHEET]);

    const remove = [...el.querySelectorAll('button')].find((b) =>
      b.getAttribute('aria-label')?.includes('Certificate of analysis'),
    );
    remove?.click();

    expect(emitted.at(-1)).toEqual([SHEET]);
  });

  it('says when a document expires, and when it does not', async () => {
    const { el } = await render([CERTIFICATE, SHEET]);
    expect(el.textContent).toContain(text.noExpiry);
    // The date is the deployment's format, so only its presence is asserted.
    expect(el.textContent).toContain(text.expires.replace('{date}', '').trim());
  });
});
