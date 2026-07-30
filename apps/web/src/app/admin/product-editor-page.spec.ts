import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
  Router,
} from '@angular/router';
import { AdminCategory, AdminProduct } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { ADMIN_TEXT } from '../config/admin-text';
import { defaultAppText } from '../config/app-text.fixture';
import { defaultAdminText } from '../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { AdminCatalogService } from './admin-catalog.service';
import { ProductEditorPage } from './product-editor-page';

const text = defaultAdminText.productEditor;

const category: AdminCategory = {
  id: 'cat-1',
  slug: 'espresso',
  name: 'Espresso Roasts',
  parentId: null,
  sortOrder: 0,
  image: null,
  description: null,
  productCount: 3,
  childCount: 0,
};

const storedProduct: AdminProduct = {
  slug: 'hafen-espresso',
  name: 'Hafen Espresso',
  priceMinor: 1890,
  categoryId: 'cat-1',
  sourceId: 'manual:x',
  descriptionHtml: '<p>Dark.</p>',
  attributes: [],
  images: [],
  deletedAt: null,
  updatedAt: '2026-07-30T10:00:00.000Z',
};

const config = {
  branding: { title: 'Test Shop' },
  catalog: { currency: { code: 'EUR', locale: 'de-DE' } },
} as unknown as DeploymentConfig;

interface Harness {
  createProduct: ReturnType<typeof vi.fn>;
  updateProduct: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

async function render(
  params: Record<string, string | null>,
  query: Record<string, string> = {},
): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<ProductEditorPage>>;
  el: HTMLElement;
  h: Harness;
}> {
  const h: Harness = {
    createProduct: vi
      .fn()
      .mockResolvedValue({ ok: true, product: storedProduct }),
    updateProduct: vi
      .fn()
      .mockResolvedValue({ ok: true, product: storedProduct }),
    navigate: vi.fn().mockResolvedValue(true),
  };
  const paramMap: ParamMap = convertToParamMap(params);
  const queryParamMap: ParamMap = convertToParamMap(query);

  TestBed.configureTestingModule({
    imports: [ProductEditorPage],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      { provide: Router, useValue: { navigate: h.navigate } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap, queryParamMap } },
      },
      {
        provide: AdminCatalogService,
        useValue: {
          listCategories: () => Promise.resolve([category]),
          getProduct: () => Promise.resolve(storedProduct),
          createProduct: h.createProduct,
          updateProduct: h.updateProduct,
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(ProductEditorPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, h };
}

function inputByLabel(el: HTMLElement, label: string): HTMLInputElement {
  const span = [...el.querySelectorAll('span')].find(
    (s) => s.textContent?.trim() === label,
  );
  const input = span?.closest('label')?.querySelector('input');
  if (!input) throw new Error(`no input labelled "${label}"`);
  return input as HTMLInputElement;
}

function setInput(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function saveButton(el: HTMLElement): HTMLButtonElement {
  const button = [...el.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(defaultAdminText.common.save),
  );
  if (!button) throw new Error('no save button');
  return button;
}

describe('ProductEditorPage', () => {
  it('creates a product and omits the slug so the server derives it', async () => {
    const { fixture, el, h } = await render({ slug: null });

    setInput(inputByLabel(el, text.name), 'New Roast');
    setInput(inputByLabel(el, text.price), '12.50');
    (
      fixture.componentInstance as unknown as {
        categoryId: { set(v: string): void };
      }
    ).categoryId.set('cat-1');
    saveButton(el).click();
    await fixture.whenStable();

    expect(h.createProduct).toHaveBeenCalledTimes(1);
    const body = h.createProduct.mock.calls[0][0];
    expect(body).not.toHaveProperty('slug');
    expect(body).toMatchObject({
      name: 'New Roast',
      categoryId: 'cat-1',
      priceMinor: 1250,
    });
    expect(h.navigate).toHaveBeenCalledWith(['/product', storedProduct.slug]);
  });

  it('sends a hand-edited slug as an explicit override on create', async () => {
    const { fixture, el, h } = await render({ slug: null });

    setInput(inputByLabel(el, text.name), 'New Roast');
    setInput(inputByLabel(el, text.price), '12.50');
    setInput(inputByLabel(el, text.slug), 'custom-slug');
    (
      fixture.componentInstance as unknown as {
        categoryId: { set(v: string): void };
      }
    ).categoryId.set('cat-1');
    saveButton(el).click();
    await fixture.whenStable();

    expect(h.createProduct.mock.calls[0][0]).toMatchObject({
      slug: 'custom-slug',
    });
  });

  it('refuses to save without a name and does not call the server', async () => {
    const { fixture, el, h } = await render({ slug: null });

    setInput(inputByLabel(el, text.price), '12.50');
    (
      fixture.componentInstance as unknown as {
        categoryId: { set(v: string): void };
      }
    ).categoryId.set('cat-1');
    saveButton(el).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(h.createProduct).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.nameRequired);
  });

  it('refuses to save without a category', async () => {
    const { fixture, el, h } = await render({ slug: null });

    setInput(inputByLabel(el, text.name), 'New Roast');
    setInput(inputByLabel(el, text.price), '12.50');
    saveButton(el).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(h.createProduct).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.categoryRequired);
  });

  it('updates an existing product under its stable slug', async () => {
    const { fixture, el, h } = await render({ slug: 'hafen-espresso' });

    setInput(inputByLabel(el, text.name), 'Hafen Espresso Reserve');
    saveButton(el).click();
    await fixture.whenStable();

    expect(h.updateProduct).toHaveBeenCalledTimes(1);
    expect(h.updateProduct.mock.calls[0][0]).toBe('hafen-espresso');
    expect(h.updateProduct.mock.calls[0][1]).toMatchObject({
      name: 'Hafen Espresso Reserve',
    });
  });
});
