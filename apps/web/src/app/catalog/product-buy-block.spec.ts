import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProductDetail } from '@b2b-catalog-platform/shared';
import { CartService } from '../cart/cart.service';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { ProductBuyBlock } from './product-buy-block';
import { packagedPackaging, productDetail } from './product.fixture';

const text = defaultAppText.cart;
const unitText = defaultAppText.catalog.units;
const pairingText = defaultAppText.catalog.pairings;

/**
 * Ten to a pack, four packs to a box (so forty pieces), and a hundred-piece
 * minimum — ten whole packs, which is what the minimum now has to be.
 */
const packaged = productDetail({
  slug: 'filter-roast',
  name: 'Filter Roast',
  packaging: { ...packagedPackaging, piecesPerPack: 10, minPieceQty: 100 },
  // €0.70 a piece, and every other figure is that multiplied out: a step is a
  // pack of ten, a box is four of those. The arithmetic guarantees they agree,
  // so a fixture that disagreed would be testing a shop that cannot exist.
  prices: {
    pieceMilliMinor: 70_000,
    pieceLotMinor: 700,
    pack: 700,
    box: 2800,
  },
});

async function render(item: ProductDetail, canAdd = true) {
  localStorage.clear();
  return renderKeepingCart(item, canAdd);
}

/** A fresh component over whatever the browser already holds — what a return
 * visit to the same product is. */
async function renderKeepingCart(item: ProductDetail, canAdd = true) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProductBuyBlock],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });

  const fixture = TestBed.createComponent(ProductBuyBlock);
  fixture.componentRef.setInput('item', item);
  fixture.componentRef.setInput('canAdd', canAdd);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;

  const rerender = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const quantity = () =>
    el.querySelector('input[type=text], input:not([type])');

  return {
    el,
    cart: TestBed.inject(CartService),
    rerender,
    text: () => el.textContent ?? '',
    unitLabels: () =>
      [...el.querySelectorAll('[role=radiogroup] label')].map((l) =>
        (l.textContent ?? '').trim(),
      ),
    quantityInput: () => quantity() as HTMLInputElement,
    async type(value: string) {
      const input = quantity() as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await rerender();
    },
    async blurQuantity() {
      (quantity() as HTMLInputElement).dispatchEvent(new Event('blur'));
      await rerender();
    },
    async chooseUnit(label: string) {
      const option = [...el.querySelectorAll('[role=radiogroup] label')].find(
        (l) => (l.textContent ?? '').trim() === label,
      );
      option?.querySelector('input')?.dispatchEvent(new Event('change'));
      await rerender();
    },
    async click(label: string) {
      const button = [...el.querySelectorAll('button')].find(
        (b) =>
          (b.textContent ?? '').includes(label) ||
          b.getAttribute('aria-label') === label,
      );
      button?.click();
      await rerender();
    },
    noteField: () => el.querySelector('textarea') as HTMLTextAreaElement,
    /** Types, then leaves the field — which is when a note is recorded. */
    async note(value: string) {
      const area = el.querySelector('textarea') as HTMLTextAreaElement;
      area.value = value;
      area.dispatchEvent(new Event('input'));
      await rerender();
      area.dispatchEvent(new Event('change'));
      await rerender();
    },
  };
}

describe('ProductBuyBlock', () => {
  // The same two lines a grid tile shows, word for word — a customer comparing
  // a card against the page it links to is comparing the same sentences.
  it('states the minimum and the packaging exactly as a tile does', async () => {
    const view = await render(packaged);

    expect(view.text()).toContain(
      `${unitText.minQuantity}: 100 ${unitText.piece}`,
    );
    expect(view.text()).toContain(`${unitText.packaging}: 4 pk × 10 pcs`);
  });

  it('carries the buying controls, priced and ready', async () => {
    const view = await render(packaged);

    expect(view.unitLabels()).toEqual([
      unitText.pieceName,
      unitText.packName,
      unitText.boxName,
    ]);
    expect(view.quantityInput().value).toBe('100');
    // The per-piece price, which is the block's headline figure.
    expect(view.text()).toContain('0,70');
  });

  // FR-CART-08: off by default, and where enabled it is optional.
  it('offers the note only where the product asks for one', async () => {
    const plain = await render(packaged);
    expect(plain.el.querySelector('textarea')).toBeNull();

    const noted = await render(
      productDetail({ lineNoteEnabled: true, lineNotePrompt: 'Which colour?' }),
    );

    // The product's question is the field's placeholder, not a line under it.
    expect(noted.el.querySelector('textarea')?.placeholder).toBe(
      'Which colour?',
    );
  });

  it("falls back to the app's own wording where the product names no prompt", async () => {
    const view = await render(
      productDetail({ lineNoteEnabled: true, lineNotePrompt: null }),
    );

    expect(view.el.querySelector('textarea')?.placeholder).toBe(
      text.notePrompt,
    );
  });

  it('carries the typed note onto the line', async () => {
    const view = await render(
      productDetail({ lineNoteEnabled: true, lineNotePrompt: null }),
    );
    await view.note('100 in red, 100 in blue');
    await view.click(text.add);

    expect(view.cart.lines()[0].note).toBe('100 in red, 100 in blue');
  });

  // The field is the line's note once the product is in the cart, so it shows
  // what is on the line rather than starting empty on every visit.
  it('shows the note already on the line, and rewrites it in place', async () => {
    const noted = productDetail({
      lineNoteEnabled: true,
      lineNotePrompt: null,
    });
    const first = await render(noted);
    await first.note('100 in red');
    await first.click(text.add);
    expect(first.cart.lines()[0].note).toBe('100 in red');

    // A second visit to the same product, cart intact.
    const again = await renderKeepingCart(noted);
    expect(again.noteField().value).toBe('100 in red');

    await again.note('100 in blue');
    expect(again.cart.lines()[0].note).toBe('100 in blue');
  });

  it('offers no way to add from the editor preview', async () => {
    const view = await render(packaged, false);

    expect(view.text()).not.toContain(text.add);
  });

  // FR-SET-05 on the product page: after the packaging facts and before the
  // note — one more thing the product says about itself, and the note is the
  // one thing on this panel the customer writes.
  it('names the counterparts once, between the packaging and the note', async () => {
    const view = await render(
      productDetail({ pairedCount: 2, lineNoteEnabled: true }),
    );

    const el = view.el;
    const link = el.querySelector('app-product-pairings');
    const facts = el.querySelector('app-product-unit-facts');
    const field = el.querySelector('textarea');
    if (!link || !facts || !field) throw new Error('expected all three');

    expect(link.textContent).toContain(pairingText.label);
    expect(
      facts.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      link.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Once: the controls do not also carry the glyph.
    expect(el.querySelectorAll('app-product-pairings')).toHaveLength(1);
  });

  it('says nothing about counterparts for a product sold alone', async () => {
    const view = await render(packaged);

    expect(view.el.querySelector('app-product-pairings')).toBeNull();
  });
});
