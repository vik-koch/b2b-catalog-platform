import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
  Router,
} from '@angular/router';
import {
  AdminCategory,
  AdminProduct,
  CustomerTier,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { DeploymentConfig } from '../../config/deployment-config.type';
import { AdminCatalogService } from '../admin-catalog.service';
import { TiersService } from '../tiers/tiers.service';
import { ProductEditorPage } from './product-editor-page';

const text = defaultAdminText.productEditor;

const category: AdminCategory = {
  id: 'cat-1',
  slug: 'espresso',
  name: 'Espresso Roasts',
  shortName: null,
  parentId: null,
  sortOrder: 0,
  image: null,
  sourceId: 'manual:x',
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
  tierPrices: [],
  deletedAt: null,
  publishedAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:00.000Z',
  priceBasisPieces: 1,
  piecesPerPack: null,
  packsPerBox: null,
  minPieceQty: 1,
  boxVolume: null,
  boxWeight: null,
  boxCount: 1,
};

const config = {
  branding: { title: 'Test Shop' },
  catalog: {
    currency: { code: 'EUR', locale: 'de-DE' },
    boxUnits: { volume: 'm³', weight: 'kg' },
  },
} as unknown as DeploymentConfig;

interface Harness {
  createProduct: ReturnType<typeof vi.fn>;
  updateProduct: ReturnType<typeof vi.fn>;
  setProductPublished: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

/** The product as the server returns it once an admin has published it. */
const publishedProduct: AdminProduct = {
  ...storedProduct,
  publishedAt: '2026-08-02T09:00:00.000Z',
};

/** A newly created product: saved, but not on the storefront yet (FR-ADM-06). */
const unpublishedProduct: AdminProduct = {
  ...storedProduct,
  publishedAt: null,
};

const wholesale: CustomerTier = {
  id: 'tier-w',
  key: 'wholesale',
  label: 'Wholesale',
  userCount: 2,
  priceCount: 1,
  sortOrder: 0,
  updatedAt: '2026-08-01T00:00:00.000Z',
};

async function render(
  params: Record<string, string | null>,
  query: Record<string, string> = {},
  options: { tiers?: CustomerTier[]; product?: AdminProduct } = {},
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
    setProductPublished: vi.fn().mockResolvedValue(publishedProduct),
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
          getProduct: () => Promise.resolve(options.product ?? storedProduct),
          createProduct: h.createProduct,
          updateProduct: h.updateProduct,
          setProductPublished: h.setProductPublished,
        },
      },
      {
        provide: TiersService,
        useValue: {
          list: () =>
            Promise.resolve({
              tiers: options.tiers ?? [],
              defaultUserCount: 0,
            }),
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

/** A tier's price field, found by the aria-label the editor gives it. */
function tierInput(el: HTMLElement, tierLabel: string): HTMLInputElement {
  const input = el.querySelector<HTMLInputElement>(
    `input[aria-label="${tierLabel}"]`,
  );
  if (!input) throw new Error(`no price field for tier "${tierLabel}"`);
  return input;
}

function saveButton(el: HTMLElement): HTMLButtonElement {
  const button = [...el.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(defaultAdminText.common.save),
  );
  if (!button) throw new Error('no save button');
  return button;
}

function buttonByText(el: HTMLElement, label: string): HTMLButtonElement {
  const button = [...el.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no button labelled "${label}"`);
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
  it('round-trips a box dimension through the deployment separator', async () => {
    const { fixture, el, h } = await render(
      { slug: 'hafen-espresso' },
      {},
      {
        product: {
          ...storedProduct,
          piecesPerPack: 6,
          packsPerBox: 4,
          boxVolume: '0.250',
          boxWeight: '12.500',
        },
      },
    );

    // Stored with a dot, shown with the locale's comma — the price field beside
    // it does the same, and a form that mixes both reads as two data sources.
    const volume = el.querySelector<HTMLInputElement>('#packaging-boxVolume');
    expect(volume?.value).toBe('0,250');

    saveButton(el).click();
    await fixture.whenStable();

    // ...and sent back as the decimal string the column holds.
    expect(h.updateProduct.mock.calls[0][1]).toMatchObject({
      boxVolume: '0.250',
      boxWeight: '12.500',
    });
  });

  describe('tier prices (FR-AUTH-05)', () => {
    it('shows no tier section when the deployment has no tiers', async () => {
      const { el } = await render({ slug: 'hafen-espresso' });

      expect(el.textContent).not.toContain(text.tierPrices.heading);
    });

    it('sends a typed tier price as minor units alongside the base price', async () => {
      const { fixture, el, h } = await render(
        { slug: 'hafen-espresso' },
        {},
        {
          tiers: [wholesale],
        },
      );

      setInput(tierInput(el, wholesale.label), '9,50');
      saveButton(el).click();
      await fixture.whenStable();

      expect(h.updateProduct.mock.calls[0][1]).toMatchObject({
        priceMinor: 1890,
        tierPrices: [{ tierId: 'tier-w', priceMinor: 950 }],
      });
    });

    it('loads an existing override into its field', async () => {
      const { el } = await render(
        { slug: 'hafen-espresso' },
        {},
        {
          tiers: [wholesale],
          product: {
            ...storedProduct,
            tierPrices: [{ tierId: 'tier-w', priceMinor: 950 }],
          },
        },
      );

      // Shown in the deployment locale (de-DE here) at full precision, so the
      // field reads the way the storefront prints prices.
      expect(tierInput(el, wholesale.label).value).toBe('9,50');
    });

    it('clearing a field drops the override rather than sending a zero', async () => {
      const { fixture, el, h } = await render(
        { slug: 'hafen-espresso' },
        {},
        {
          tiers: [wholesale],
          product: {
            ...storedProduct,
            tierPrices: [{ tierId: 'tier-w', priceMinor: 950 }],
          },
        },
      );

      setInput(tierInput(el, wholesale.label), '');
      saveButton(el).click();
      await fixture.whenStable();

      // An empty field means "charge this tier the base price", which is the
      // absence of a row — not a price of nothing.
      expect(h.updateProduct.mock.calls[0][1].tierPrices).toEqual([]);
    });

    it('names the tier when its price is invalid', async () => {
      const { fixture, el, h } = await render(
        { slug: 'hafen-espresso' },
        {},
        {
          tiers: [wholesale],
        },
      );

      setInput(tierInput(el, wholesale.label), '-5');
      saveButton(el).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(h.updateProduct).not.toHaveBeenCalled();
      expect(el.textContent).toContain(
        text.tierPrices.invalid.replace('{tier}', wholesale.label),
      );
    });
  });
  describe('publication (FR-ADM-06)', () => {
    it('saves first and publishes second, then lands on the storefront page', async () => {
      const { fixture, el, h } = await render(
        { slug: null },
        {},
        { product: unpublishedProduct },
      );

      setInput(inputByLabel(el, text.name), 'New Roast');
      setInput(inputByLabel(el, text.price), '12.50');
      (
        fixture.componentInstance as unknown as {
          categoryId: { set(v: string): void };
        }
      ).categoryId.set('cat-1');
      h.createProduct.mockResolvedValue({
        ok: true,
        product: unpublishedProduct,
      });

      buttonByText(el, text.saveAndPublish).click();
      await fixture.whenStable();

      // The order is the point: the edits are saved before anything is made
      // public, so a failure to publish never costs the admin their work.
      expect(h.createProduct).toHaveBeenCalledTimes(1);
      expect(h.setProductPublished).toHaveBeenCalledWith(
        unpublishedProduct.slug,
        true,
      );
      expect(h.createProduct.mock.invocationCallOrder[0]).toBeLessThan(
        h.setProductPublished.mock.invocationCallOrder[0],
      );
      expect(h.navigate).toHaveBeenCalledWith([
        '/product',
        publishedProduct.slug,
      ]);
    });

    it('reports a failed publish without losing the save', async () => {
      const { fixture, el, h } = await render(
        { slug: null },
        {},
        { product: unpublishedProduct },
      );

      setInput(inputByLabel(el, text.name), 'New Roast');
      setInput(inputByLabel(el, text.price), '12.50');
      (
        fixture.componentInstance as unknown as {
          categoryId: { set(v: string): void };
        }
      ).categoryId.set('cat-1');
      h.createProduct.mockResolvedValue({
        ok: true,
        product: unpublishedProduct,
      });
      h.setProductPublished.mockRejectedValue(new Error('nope'));

      buttonByText(el, text.saveAndPublish).click();
      await fixture.whenStable();
      fixture.detectChanges();

      // The product exists; only the publication did not happen — so the page
      // stays put and says which half failed.
      expect(h.createProduct).toHaveBeenCalledTimes(1);
      expect(el.textContent).toContain(text.publishError);
      expect(h.navigate).not.toHaveBeenCalled();
    });

    it('sends an unpublished save back to the list, searched for the product', async () => {
      // There is no storefront page to land on: it would 404.
      const { fixture, el, h } = await render(
        { slug: null },
        {},
        { product: unpublishedProduct },
      );

      setInput(inputByLabel(el, text.name), 'New Roast');
      setInput(inputByLabel(el, text.price), '12.50');
      (
        fixture.componentInstance as unknown as {
          categoryId: { set(v: string): void };
        }
      ).categoryId.set('cat-1');
      h.createProduct.mockResolvedValue({
        ok: true,
        product: unpublishedProduct,
      });

      saveButton(el).click();
      await fixture.whenStable();

      expect(h.setProductPublished).not.toHaveBeenCalled();
      expect(h.navigate).toHaveBeenCalledWith(['/admin/products'], {
        queryParams: { searchTerm: unpublishedProduct.name },
      });
    });
  });
});
