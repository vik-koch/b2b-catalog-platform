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
  fillText,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { provideOwnership } from '../settings/settings.fixture';
import { defaultAppText } from '../../config/app-text.fixture';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { DeploymentConfig } from '../../config/deployment-config.type';
import { AdminCatalogService } from '../admin-catalog.service';
import { TiersService } from '../tiers/tiers.service';
import { AttributesService } from '../attributes/attributes.service';
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
  pairings: [],
  documents: [],
  deletedAt: null,
  publishedAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:00.000Z',
  piecesPerPack: null,
  packsPerBox: null,
  minPieceQty: 1,
  boxVolume: null,
  boxWeight: null,
  boxCount: 1,
  lineNoteEnabled: false,
  lineNotePrompt: null,
  stockPieces: null,
  lowStockThresholdPieces: null,
  availability: null,
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

/** The storefront's list, which every deployment has. */
const baseList: CustomerTier = {
  id: 'tier-d',
  key: 'default',
  label: 'Base price list',
  userCount: 0,
  priceCount: 0,
  isDefault: true,
  wouldUnpublish: 0,
  sortOrder: 0,
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const wholesale: CustomerTier = {
  id: 'tier-w',
  key: 'wholesale',
  label: 'Wholesale',
  isDefault: false,
  wouldUnpublish: 0,
  userCount: 2,
  priceCount: 1,
  sortOrder: 0,
  updatedAt: '2026-08-01T00:00:00.000Z',
};

async function render(
  params: Record<string, string | null>,
  query: Record<string, string> = {},
  options: {
    tiers?: CustomerTier[];
    product?: AdminProduct;
    /** Renders the screen as it looks while an external system owns the
     * catalog (FR-ADM-10). */
    catalogOwned?: boolean;
  } = {},
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
      options.catalogOwned ? provideOwnership('catalog') : provideOwnership(),
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
        // The grid's hint list; empty here, its own suite covers it.
        provide: AttributesService,
        useValue: {
          listKeys: () => Promise.resolve([]),
          list: () => Promise.resolve([]),
        },
      },
      {
        provide: TiersService,
        useValue: {
          list: () =>
            // The storefront's list is always there: the price field above
            // the others is that list's, and it is named after it.
            Promise.resolve({
              tiers: [baseList, ...(options.tiers ?? [])],
              productCount: 0,
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

/** The price field's caption, which names the list it writes. */
const priceLabel = fillText(text.priceWithList, { list: baseList.label });

function inputByLabel(el: HTMLElement, label: string): HTMLInputElement {
  // A mandatory field's caption carries a trailing asterisk; the caption is
  // still what identifies the field.
  const span = [...el.querySelectorAll('span')].find(
    (s) => s.textContent?.replace(/\*$/, '').trim() === label,
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
    setInput(inputByLabel(el, priceLabel), '12.50');
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
    setInput(inputByLabel(el, priceLabel), '12.50');
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

    setInput(inputByLabel(el, priceLabel), '12.50');
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
    setInput(inputByLabel(el, priceLabel), '12.50');
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
  it('shows the box count a product ships with, one included', async () => {
    const { el } = await render(
      { slug: 'hafen-espresso' },
      {},
      {
        product: {
          ...storedProduct,
          piecesPerPack: 6,
          packsPerBox: 4,
          minPieceQty: 6,
        },
      },
    );

    // "Ships as 1 box" is the rule the product carries, shown like the minimum
    // and the basis rather than left blank for the admin to infer.
    const count = el.querySelector<HTMLInputElement>('#packaging-boxCount');
    expect(count?.value).toBe('1');
  });

  it('leaves the box count empty on a product with no box', async () => {
    const { el } = await render({ slug: 'hafen-espresso' });

    const count = el.querySelector<HTMLInputElement>('#packaging-boxCount');
    expect(count?.value).toBe('');
    expect(count?.disabled).toBe(true);
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
          minPieceQty: 6,
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

  describe('line note (FR-CART-08)', () => {
    it('keeps the prompt field out of the form until the note is enabled', async () => {
      const { fixture, el } = await render({ slug: 'hafen-espresso' });

      expect(() => inputByLabel(el, text.lineNote.prompt)).toThrow();

      inputByLabel(el, text.lineNote.enable).click();
      fixture.detectChanges();
      expect(inputByLabel(el, text.lineNote.prompt).value).toBe('');
    });

    it('loads a stored note policy and sends it back on save', async () => {
      const { fixture, el, h } = await render(
        { slug: 'hafen-espresso' },
        {},
        {
          product: {
            ...storedProduct,
            lineNoteEnabled: true,
            lineNotePrompt: 'Which colour?',
          },
        },
      );

      expect(inputByLabel(el, text.lineNote.prompt).value).toBe(
        'Which colour?',
      );

      setInput(inputByLabel(el, text.lineNote.prompt), 'Which finish?');
      saveButton(el).click();
      await fixture.whenStable();

      expect(h.updateProduct.mock.calls[0][1]).toMatchObject({
        lineNoteEnabled: true,
        lineNotePrompt: 'Which finish?',
      });
    });

    it('drops the prompt when the note is switched off', async () => {
      const { fixture, el, h } = await render(
        { slug: 'hafen-espresso' },
        {},
        {
          product: {
            ...storedProduct,
            lineNoteEnabled: true,
            lineNotePrompt: 'Which colour?',
          },
        },
      );

      inputByLabel(el, text.lineNote.enable).click();
      fixture.detectChanges();
      saveButton(el).click();
      await fixture.whenStable();

      expect(h.updateProduct.mock.calls[0][1]).toMatchObject({
        lineNoteEnabled: false,
        lineNotePrompt: null,
      });
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

    it('drops a tier field holding a zero, the way an empty one is dropped', async () => {
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

      const field = tierInput(el, wholesale.label);
      setInput(field, '0,00');
      // Leaving the field empties it: no price is what a zero means, and an
      // empty field is how this editor says it.
      field.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(field.value).toBe('');

      saveButton(el).click();
      await fixture.whenStable();

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
    it('reads a price of zero as no price at all', async () => {
      const { fixture, el, h } = await render(
        { slug: 'hafen-espresso' },
        {},
        { product: publishedProduct },
      );

      const field = inputByLabel(el, priceLabel);
      setInput(field, '0,00');
      fixture.detectChanges();

      // The same warning an emptied field raises, and the same button: zero is
      // that state written differently, not a product that costs nothing.
      expect(el.textContent).toContain(text.priceCleared);

      // And leaving the field empties it, so the form stops showing a price
      // it is not going to store.
      field.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(field.value).toBe('');
      expect(() => buttonByText(el, text.saveAndPublish)).toThrow();

      buttonByText(el, text.saveAndUnpublish).click();
      await fixture.whenStable();

      expect(h.updateProduct.mock.calls[0][1].priceMinor).toBeNull();
    });

    it('saves first and publishes second, then lands on the storefront page', async () => {
      const { fixture, el, h } = await render(
        { slug: null },
        {},
        { product: unpublishedProduct },
      );

      setInput(inputByLabel(el, text.name), 'New Roast');
      setInput(inputByLabel(el, priceLabel), '12.50');
      (
        fixture.componentInstance as unknown as {
          categoryId: { set(v: string): void };
        }
      ).categoryId.set('cat-1');
      h.createProduct.mockResolvedValue({
        ok: true,
        product: unpublishedProduct,
      });
      // The publish button appears with the price: without one there is
      // nothing to put on the storefront.
      fixture.detectChanges();

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
      setInput(inputByLabel(el, priceLabel), '12.50');
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
      fixture.detectChanges();

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
      setInput(inputByLabel(el, priceLabel), '12.50');
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

  describe('while an external system owns the catalog (FR-ADM-10)', () => {
    it("locks the fields it writes and leaves the shop's own alone", async () => {
      const { el } = await render(
        { slug: 'coffee-beans' },
        {},
        { catalogOwned: true },
      );

      expect(inputByLabel(el, text.name).disabled).toBe(true);
      expect(inputByLabel(el, priceLabel).disabled).toBe(true);
      expect(inputByLabel(el, text.sourceId).disabled).toBe(true);
      expect(inputByLabel(el, text.stock.pieces).disabled).toBe(true);

      // The slug is the shop's address for the product, not the exchange's
      // key for it, and the "few left" figure is a wording rule rather than a
      // stock count — neither is in the owned list.
      expect(inputByLabel(el, text.slug).disabled).toBe(false);
    });

    it('says why, once, rather than under every locked field', async () => {
      const { el } = await render(
        { slug: 'coffee-beans' },
        {},
        { catalogOwned: true },
      );

      const explanation = defaultAdminText.ownership.fieldLocked;
      const occurrences = [...el.querySelectorAll('p')].filter(
        (p) => p.textContent?.trim() === explanation,
      );
      expect(occurrences).toHaveLength(1);
    });

    it('leaves every field editable when nothing is owned', async () => {
      const { el } = await render({ slug: 'coffee-beans' });

      expect(inputByLabel(el, text.name).disabled).toBe(false);
      expect(inputByLabel(el, priceLabel).disabled).toBe(false);
      expect(inputByLabel(el, text.stock.pieces).disabled).toBe(false);
    });
  });

  describe('creating while an external system owns the catalog', () => {
    it('explains instead of offering a form', async () => {
      // Both affordances that lead here — the list's button and the
      // storefront's "add product here" — land on this route, so this is the
      // one screen that has to say why.
      const { el } = await render({ slug: null }, {}, { catalogOwned: true });

      expect(el.textContent).toContain(
        defaultAdminText.ownership.productCreate,
      );
      expect(el.querySelector('input')).toBeNull();
    });

    it('offers no way to save, but keeps a way out', async () => {
      const { el } = await render({ slug: null }, {}, { catalogOwned: true });

      const labels = [...el.querySelectorAll('button')].map((b) =>
        b.textContent?.trim(),
      );
      expect(labels).not.toContain(defaultAdminText.common.save);
      expect(labels).toContain(defaultAdminText.common.cancel);
    });

    it('still offers the form when nothing is owned', async () => {
      const { el } = await render({ slug: null });

      expect(inputByLabel(el, text.name).disabled).toBe(false);
    });
  });
});
